import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestContext.headers),
}));

import {
  UserRole,
  type Prisma,
  type Session,
} from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { getTestEnvironment } from "../../test/test-environment";
import {
  appendAuditOutcomeInTransaction,
  createLoginSucceededAuditIntent,
  generateAuditOperationId,
} from "../audit/audit";
import { auth } from "./auth";
import { requireApplicationUser, requireAuthenticatedUser } from "./guards";
import {
  type LoginAuditMarker,
  type LoginAuditTestDependencies,
} from "./login-audit-internal";
import { handleAuditedEmailSignInForTest } from "./login-audit.test-support";
import { applyBetterAuthRoutePolicy } from "./route-policy";

const password = "Fictional audited login passphrase 2030";
const futureExpiry = new Date("2035-01-02T03:04:05.000Z");
const expiredCredential = new Date("2020-01-02T03:04:05.000Z");
const twelveHoursMilliseconds = 12 * 60 * 60 * 1_000;
const testOrigin = getTestEnvironment().origin;

type FixtureUser = Readonly<{
  id: string;
  email: string;
  organisationId: string;
}>;

type FixtureOptions = Readonly<{
  role: UserRole;
  banned?: boolean;
  mustChangePassword?: boolean;
  temporaryCredentialExpiresAt?: Date | null;
}>;

function authenticationHeaders(ipAddress: string, cookie?: string): Headers {
  return new Headers({
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
    origin: testOrigin,
    "x-real-ip": ipAddress,
  });
}

function signInRequest(options: {
  email: string;
  password?: string;
  ipAddress: string;
}): Request {
  return new Request(`${testOrigin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: authenticationHeaders(options.ipAddress),
    body: JSON.stringify({
      email: options.email,
      password: options.password ?? password,
    }),
  });
}

function cookieHeader(setCookieHeaders: readonly string[]): string {
  return setCookieHeaders
    .map((setCookie) => setCookie.split(";", 1)[0])
    .filter((cookie): cookie is string => cookie !== undefined)
    .join("; ");
}

async function clearAuthenticationFixtures(): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.rateLimit.deleteMany();
}

async function createFixtureUser(
  options: FixtureOptions,
): Promise<FixtureUser> {
  const organisationId = randomUUID();
  const email = `${randomUUID()}@example.test`;

  await prisma.organisation.create({
    data: {
      id: organisationId,
      name: "Fiktiv inloggningsorganisation",
    },
  });
  const created = await auth.api.createUser({
    body: {
      name: "Fiktiv Inloggningsperson",
      email,
      password,
      role: options.role,
      data: {
        organisationId,
        professionalTitle: "Fiktiv yrkesroll",
        mustChangePassword: options.mustChangePassword ?? false,
        temporaryCredentialExpiresAt:
          options.temporaryCredentialExpiresAt ?? null,
      },
    },
  });

  if (options.banned === true) {
    await prisma.user.update({
      where: { id: created.user.id },
      data: { banned: true },
    });
  }

  return { id: created.user.id, email, organisationId };
}

async function auditedSignIn(
  request: Request,
  dependencies: LoginAuditTestDependencies = {},
): Promise<Response> {
  return applyBetterAuthRoutePolicy((currentRequest) =>
    handleAuditedEmailSignInForTest(currentRequest, dependencies),
  )(request);
}

async function loadLoginOperation(userId: string) {
  return prisma.auditOperation.findFirstOrThrow({
    where: { actorUserId: userId, action: "LOGIN_SUCCEEDED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      actorKind: true,
      actorUserId: true,
      organisationId: true,
      targetType: true,
      targetId: true,
      events: {
        orderBy: { occurredAt: "asc" },
        select: { type: true, result: true, resolvedTargetId: true },
      },
    },
  });
}

async function loadLoginFailedOperation(operationId: string) {
  return prisma.auditOperation.findUniqueOrThrow({
    where: { id: operationId },
    select: {
      id: true,
      organisationId: true,
      actorKind: true,
      actorUserId: true,
      action: true,
      targetType: true,
      targetId: true,
      events: {
        orderBy: { occurredAt: "asc" },
        select: { type: true, result: true, resolvedTargetId: true },
      },
    },
  });
}

beforeEach(async () => {
  await clearAuthenticationFixtures();
  requestContext.headers = new Headers();
  vi.restoreAllMocks();
});

afterEach(async () => {
  await clearAuthenticationFixtures();
  requestContext.headers = new Headers();
  vi.restoreAllMocks();
});

describe("audited LOGIN_SUCCEEDED Session establishment", () => {
  it.each([
    ["Administrator", UserRole.ADMINISTRATOR, false, "192.0.2.10"],
    ["Staff Member", UserRole.STAFF_MEMBER, false, "192.0.2.11"],
    ["forced password change", UserRole.STAFF_MEMBER, true, "192.0.2.12"],
  ] as const)(
    "commits Session, audit success, and cookie for %s",
    async (_label, role, mustChangePassword, ipAddress) => {
      const user = await createFixtureUser({
        role,
        mustChangePassword,
        temporaryCredentialExpiresAt: mustChangePassword ? futureExpiry : null,
      });
      const markers: LoginAuditMarker[] = [];
      const response = await auditedSignIn(
        signInRequest({ email: user.email, ipAddress }),
        { onMarker: (marker) => markers.push(marker) },
      );

      expect(response.status).toBe(200);
      const setCookieHeaders = response.headers.getSetCookie();
      expect(setCookieHeaders.length).toBeGreaterThan(0);
      expect(markers).toEqual([
        "TRUSTED_IDENTITY",
        "INTENT_PERSISTED",
        "SESSION_VERIFIED",
        "SUCCEEDED_APPENDED",
        "HANDLER_COMPLETED",
        "BACKGROUND_TASKS_DRAINED",
        "RESPONSE_BUFFERED",
      ]);

      const session = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      const observedLifetime =
        session.expiresAt.getTime() - session.createdAt.getTime();
      expect(observedLifetime).toBeGreaterThanOrEqual(
        twelveHoursMilliseconds - 2_000,
      );
      expect(observedLifetime).toBeLessThanOrEqual(twelveHoursMilliseconds);

      const authenticated = await auth.api.getSession({
        headers: authenticationHeaders(
          ipAddress,
          cookieHeader(setCookieHeaders),
        ),
        query: { disableCookieCache: true },
      });
      expect(authenticated?.user.id).toBe(user.id);
      expect(authenticated?.session.id).toBe(session.id);
      expect(authenticated?.session.userId).toBe(user.id);
      await expect(loadLoginOperation(user.id)).resolves.toEqual({
        id: expect.any(String),
        actorKind: "USER",
        actorUserId: user.id,
        organisationId: user.organisationId,
        targetType: "AUTHENTICATION",
        targetId: null,
        events: [
          { type: "OUTCOME", result: "SUCCEEDED", resolvedTargetId: null },
        ],
      });

      if (mustChangePassword) {
        requestContext.headers = authenticationHeaders(
          ipAddress,
          cookieHeader(setCookieHeaders),
        );
        await expect(requireAuthenticatedUser()).resolves.toMatchObject({
          userId: user.id,
          credentialState: "PASSWORD_CHANGE_REQUIRED",
        });
        await expect(requireApplicationUser()).rejects.toMatchObject({
          code: "PASSWORD_CHANGE_REQUIRED",
        });
      }
    },
  );

  it("rolls back Session and success before recording definitive failure", async () => {
    const user = await createFixtureUser({ role: UserRole.ADMINISTRATOR });
    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress: "192.0.2.20" }),
      {
        afterSessionVerified() {
          throw new Error("Fictional post-insert failure");
        },
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(loadLoginOperation(user.id)).resolves.toMatchObject({
      events: [{ type: "OUTCOME", result: "FAILED" }],
    });
  });

  it("rolls back Session when SUCCEEDED persistence fails and records FAILED", async () => {
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress: "192.0.2.21" }),
      {
        async appendOutcome(transaction, intent, result) {
          if (result === "SUCCEEDED") {
            throw new Error("Fictional SUCCEEDED persistence failure");
          }
          await appendAuditOutcomeInTransaction(transaction, intent, result);
        },
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(loadLoginOperation(user.id)).resolves.toMatchObject({
      events: [{ result: "FAILED" }],
    });
  });

  it("fails before Session creation when durable intent cannot be persisted", async () => {
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress: "192.0.2.22" }),
      {
        async createIntent() {
          throw new Error("Fictional durable intent failure");
        },
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditOperation.count({
        where: { actorUserId: user.id, action: "LOGIN_SUCCEEDED" },
      }),
    ).resolves.toBe(0);
  });

  it.each([
    ["banned", { banned: true }, "192.0.2.30"],
    [
      "expired temporary credential",
      {
        mustChangePassword: true,
        temporaryCredentialExpiresAt: expiredCredential,
      },
      "192.0.2.31",
    ],
  ] as const)(
    "records trusted Session-establishment failure for %s",
    async (_label, fixtureOptions, ipAddress) => {
      const user = await createFixtureUser({
        role: UserRole.STAFF_MEMBER,
        ...fixtureOptions,
      });
      const markers: LoginAuditMarker[] = [];
      const response = await auditedSignIn(
        signInRequest({ email: user.email, ipAddress }),
        { onMarker: (marker) => markers.push(marker) },
      );

      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(markers.slice(0, 2)).toEqual([
        "TRUSTED_IDENTITY",
        "INTENT_PERSISTED",
      ]);
      expect(markers).not.toContain("SESSION_VERIFIED");
      await expect(
        prisma.session.count({ where: { userId: user.id } }),
      ).resolves.toBe(0);
      await expect(loadLoginOperation(user.id)).resolves.toMatchObject({
        events: [{ type: "OUTCOME", result: "FAILED" }],
      });
    },
  );

  it("leaves the intent unresolved when FAILED persistence itself fails", async () => {
    const user = await createFixtureUser({
      role: UserRole.STAFF_MEMBER,
      banned: true,
    });
    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress: "192.0.2.32" }),
      {
        async appendOutcome(transaction, intent, result) {
          if (result === "FAILED") {
            throw new Error("Fictional FAILED persistence failure");
          }
          await appendAuditOutcomeInTransaction(transaction, intent, result);
        },
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(loadLoginOperation(user.id)).resolves.toMatchObject({
      events: [],
    });
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it("fails closed when a non-success response contains Set-Cookie", async () => {
    const user = await createFixtureUser({
      role: UserRole.STAFF_MEMBER,
      banned: true,
    });
    let injectedSetCookieHeaders: readonly string[] = [];
    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress: "192.0.2.34" }),
      {
        transformAuthenticationResponse(authenticationResponse) {
          const inconsistentResponse = new Response(
            "Fictional inconsistent Better Auth response",
            {
              status: authenticationResponse.status,
              headers: {
                "content-type": "text/plain",
                "set-cookie":
                  "fictional-session=must-not-escape; Path=/; HttpOnly; SameSite=Lax",
              },
            },
          );
          injectedSetCookieHeaders =
            inconsistentResponse.headers.getSetCookie();
          return inconsistentResponse;
        },
      },
    );

    expect(injectedSetCookieHeaders).toHaveLength(1);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "AUTHENTICATION_UNAVAILABLE",
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(loadLoginOperation(user.id)).resolves.toMatchObject({
      events: [{ type: "OUTCOME", result: "FAILED" }],
    });
  });

  it("does not retry FAILED persistence after definitive rollback", async () => {
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const recordFailedOutcome = vi.fn(async () => {
      throw new Error("Fictional outside FAILED persistence failure");
    });
    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress: "192.0.2.33" }),
      {
        afterSessionVerified() {
          throw new Error("Fictional definitive callback failure");
        },
        recordFailedOutcome,
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(recordFailedOutcome).toHaveBeenCalledTimes(1);
    await expect(loadLoginOperation(user.id)).resolves.toMatchObject({
      events: [],
    });
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it("withholds cookies and requests AMBIGUOUS handling when completion acknowledgement is unavailable", async () => {
    const user = await createFixtureUser({ role: UserRole.ADMINISTRATOR });
    async function unknownCompletion<TResult>(
      callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
    ): Promise<TResult> {
      await prisma.$transaction(callback);
      throw new Error("Fictional missing commit acknowledgement");
    }
    const recordAmbiguousOutcome = vi.fn(async () => undefined);

    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress: "192.0.2.40" }),
      { transactionExecutor: unknownCompletion, recordAmbiguousOutcome },
    );

    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(recordAmbiguousOutcome).toHaveBeenCalledTimes(1);
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
    await expect(loadLoginOperation(user.id)).resolves.toMatchObject({
      events: [{ type: "OUTCOME", result: "SUCCEEDED" }],
    });
  });

  it("fails closed on an operation collision without replacing the UUID", async () => {
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const operationId = generateAuditOperationId();
    await createLoginSucceededAuditIntent({
      operationId,
      actor: { userId: user.id, organisationId: user.organisationId },
    });

    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress: "192.0.2.41" }),
      { operationId },
    );

    expect(response.status).toBe(500);
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(
      prisma.auditOperation.count({
        where: { actorUserId: user.id, action: "LOGIN_SUCCEEDED" },
      }),
    ).resolves.toBe(1);
    await expect(loadLoginOperation(user.id)).resolves.toMatchObject({
      id: operationId,
      events: [],
    });
  });

  it("drains captured RateLimit cleanup before transaction closure", async () => {
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const ipAddress = "192.0.2.50";
    await auth.handler(
      signInRequest({
        email: user.email,
        password: "Wrong fictional password",
        ipAddress,
      }),
    );
    const requestRateLimit = await prisma.rateLimit.findFirstOrThrow();
    const oldTimestamp = BigInt(Date.now() - 10 * 60 * 1_000);
    await prisma.rateLimit.update({
      where: { id: requestRateLimit.id },
      data: { lastRequest: oldTimestamp },
    });
    const expiredRowId = randomUUID();
    await prisma.rateLimit.create({
      data: {
        id: expiredRowId,
        key: `expired-login-audit-${randomUUID()}`,
        count: 1,
        lastRequest: oldTimestamp,
      },
    });

    const activity: string[] = [];
    let transactionClosed = false;
    let transactionUseAfterClosure = false;
    async function instrumentedExecutor<TResult>(
      callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
    ): Promise<TResult> {
      const result = await prisma.$transaction(async (transaction) => {
        const session = new Proxy(transaction.session, {
          get(target, property, receiver) {
            if (property === "create") {
              return async (
                args: Prisma.SessionCreateArgs,
              ): Promise<Session> => {
                if (transactionClosed) transactionUseAfterClosure = true;
                activity.push("session-insert");
                return target.create(args);
              };
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const rateLimit = new Proxy(transaction.rateLimit, {
          get(target, property, receiver) {
            if (property === "deleteMany") {
              return async (args: Prisma.RateLimitDeleteManyArgs) => {
                if (transactionClosed) transactionUseAfterClosure = true;
                activity.push("background-delete-start");
                const deleted = await target.deleteMany(args);
                activity.push("background-delete-complete");
                return deleted;
              };
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const instrumented = new Proxy(transaction, {
          get(target, property, receiver) {
            if (property === "session") return session;
            if (property === "rateLimit") return rateLimit;
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return callback(instrumented);
      });
      transactionClosed = true;
      return result;
    }

    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress }),
      {
        transactionExecutor: instrumentedExecutor,
        onMarker(marker) {
          activity.push(marker);
        },
      },
    );

    expect(response.status).toBe(200);
    expect(activity).toContain("session-insert");
    expect(activity).toContain("background-delete-start");
    expect(activity.indexOf("INTENT_PERSISTED")).toBeLessThan(
      activity.indexOf("session-insert"),
    );
    expect(activity.indexOf("session-insert")).toBeLessThan(
      activity.indexOf("SESSION_VERIFIED"),
    );
    expect(activity.indexOf("background-delete-complete")).toBeLessThan(
      activity.indexOf("BACKGROUND_TASKS_DRAINED"),
    );
    expect(transactionUseAfterClosure).toBe(false);
    await expect(
      prisma.rateLimit.findUnique({ where: { id: expiredRowId } }),
    ).resolves.toBeNull();
  });

  it("keeps pre-trust failures and 429 outside LOGIN_SUCCEEDED auditing", async () => {
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const cases = [
      signInRequest({
        email: user.email,
        password: "Wrong fictional password",
        ipAddress: "192.0.2.60",
      }),
      signInRequest({
        email: `${randomUUID()}@example.test`,
        password: "Wrong fictional password",
        ipAddress: "192.0.2.61",
      }),
      signInRequest({
        email: "not-an-email",
        password: "Wrong fictional password",
        ipAddress: "192.0.2.62",
      }),
    ];

    for (const request of cases) {
      const response = await auditedSignIn(request);
      expect([400, 401]).toContain(response.status);
      expect(response.headers.getSetCookie()).toEqual([]);
    }

    let rateLimitedResponse: Response | undefined;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      rateLimitedResponse = await auditedSignIn(
        signInRequest({
          email: user.email,
          password: "Wrong fictional password",
          ipAddress: "192.0.2.63",
        }),
      );
    }
    expect(rateLimitedResponse?.status).toBe(429);
    expect(rateLimitedResponse?.headers.getSetCookie()).toEqual([]);
    await expect(
      prisma.auditOperation.count({
        where: { actorUserId: user.id, action: "LOGIN_SUCCEEDED" },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it("uses only static operational logging for unexpected failures", async () => {
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fictionalSecret =
      "postgresql://fictional:credential@database.example.test/kaul";

    const response = await auditedSignIn(
      signInRequest({ email: user.email, ipAddress: "192.0.2.70" }),
      {
        afterSessionVerified() {
          throw new Error(fictionalSecret);
        },
      },
    );

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith(
      "Kaul authentication audit operation failed.",
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      fictionalSecret,
    );
    expect(await response.text()).not.toContain(fictionalSecret);
  });
});

describe("audited pre-trust LOGIN_FAILED attempts", () => {
  it("audits a wrong password with an identity-free failed outcome", async () => {
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const operationId = generateAuditOperationId();

    const response = await auditedSignIn(
      signInRequest({
        email: user.email,
        password: "Wrong fictional password",
        ipAddress: "192.0.2.80",
      }),
      { operationId },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTHENTICATION_FAILED",
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(loadLoginFailedOperation(operationId)).resolves.toEqual({
      id: operationId,
      organisationId: null,
      actorKind: "UNAUTHENTICATED",
      actorUserId: null,
      action: "LOGIN_FAILED",
      targetType: "AUTHENTICATION",
      targetId: null,
      events: [{ type: "OUTCOME", result: "FAILED", resolvedTargetId: null }],
    });
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it("audits an unknown email through the same identity-free path", async () => {
    const operationId = generateAuditOperationId();

    const response = await auditedSignIn(
      signInRequest({
        email: `${randomUUID()}@example.test`,
        password: "Wrong fictional password",
        ipAddress: "192.0.2.81",
      }),
      { operationId },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTHENTICATION_FAILED",
    });
    await expect(loadLoginFailedOperation(operationId)).resolves.toMatchObject({
      id: operationId,
      organisationId: null,
      actorKind: "UNAUTHENTICATED",
      actorUserId: null,
      action: "LOGIN_FAILED",
      targetType: "AUTHENTICATION",
      targetId: null,
      events: [{ type: "OUTCOME", result: "FAILED", resolvedTargetId: null }],
    });
  });

  it("does not audit malformed input", async () => {
    const operationId = generateAuditOperationId();
    const request = new Request(`${testOrigin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: authenticationHeaders("192.0.2.82"),
      body: JSON.stringify({
        email: "not-an-email",
        password: "Wrong fictional password",
      }),
    });

    const response = await auditedSignIn(request, { operationId });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTHENTICATION_FAILED",
    });
    await expect(
      prisma.auditOperation.findUnique({ where: { id: operationId } }),
    ).resolves.toBeNull();
  });

  it("does not audit an operational response even with the invalid-credential code", async () => {
    const operationId = generateAuditOperationId();

    const response = await auditedSignIn(
      signInRequest({
        email: `${randomUUID()}@example.test`,
        password: "Wrong fictional password",
        ipAddress: "192.0.2.86",
      }),
      {
        operationId,
        async transformAuthenticationResponse(authenticationResponse) {
          return new Response(await authenticationResponse.text(), {
            status: 503,
            headers: authenticationResponse.headers,
          });
        },
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "AUTHENTICATION_UNAVAILABLE",
    });
    await expect(
      prisma.auditOperation.findUnique({ where: { id: operationId } }),
    ).resolves.toBeNull();
  });

  it("does not audit the rate-limited request", async () => {
    const ipAddress = "192.0.2.83";
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const operationIds = Array.from({ length: 6 }, () =>
      generateAuditOperationId(),
    );
    let lastResponse: Response | undefined;

    for (const operationId of operationIds) {
      lastResponse = await auditedSignIn(
        signInRequest({
          email: user.email,
          password: "Wrong fictional password",
          ipAddress,
        }),
        { operationId },
      );
    }

    expect(lastResponse?.status).toBe(429);
    await expect(
      prisma.auditOperation.findUnique({ where: { id: operationIds[5] } }),
    ).resolves.toBeNull();
  });

  it("preserves the generic response when intent persistence fails", async () => {
    const operationId = generateAuditOperationId();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fictionalSecret = "fictional-auth-audit-secret";

    const response = await auditedSignIn(
      signInRequest({
        email: `${randomUUID()}@example.test`,
        password: "Wrong fictional password",
        ipAddress: "192.0.2.84",
      }),
      {
        operationId,
        async createFailedLoginIntent() {
          throw new Error(fictionalSecret);
        },
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTHENTICATION_FAILED",
    });
    expect(consoleError.mock.calls).toEqual([
      ["Authentication audit persistence failed."],
    ]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      fictionalSecret,
    );
    await expect(
      prisma.auditOperation.findUnique({ where: { id: operationId } }),
    ).resolves.toBeNull();
  });

  it("preserves the generic response and leaves an unresolved intent when outcome persistence fails", async () => {
    const operationId = generateAuditOperationId();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await auditedSignIn(
      signInRequest({
        email: `${randomUUID()}@example.test`,
        password: "Wrong fictional password",
        ipAddress: "192.0.2.85",
      }),
      {
        operationId,
        async recordFailedLoginOutcome() {
          throw new Error("Fictional outcome persistence failure");
        },
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTHENTICATION_FAILED",
    });
    expect(consoleError.mock.calls).toEqual([
      ["Authentication audit persistence failed."],
    ]);
    await expect(loadLoginFailedOperation(operationId)).resolves.toMatchObject({
      id: operationId,
      action: "LOGIN_FAILED",
      events: [],
    });
  });
});
