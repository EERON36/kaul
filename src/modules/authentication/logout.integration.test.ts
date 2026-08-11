import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma, UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  createLogoutSucceededAuditIntent,
  generateAuditOperationId,
} from "../audit/audit";
import { auth } from "./auth";
import { handleAuditedEmailSignInForTest } from "./login-audit.test-support";
import {
  type LogoutTestDependencies,
  type TrustedLogoutSession,
} from "./logout-internal";
import {
  createLogoutAuthenticationForTest,
  logoutCurrentSessionForTest,
} from "./logout.test-support";
import { applyBetterAuthRoutePolicy } from "./route-policy";

const password = "Fictional logout integration passphrase 2030";
const fixtureUserIds = new Set<string>();
const fixtureOrganisationIds = new Set<string>();
const fixtureRateLimitKeys = new Set<string>();

function authenticationHeaders(ipAddress: string, cookie?: string): Headers {
  fixtureRateLimitKeys.add(`${ipAddress}|/sign-in/email`);
  return new Headers({
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
    origin: "http://localhost:3000",
    "x-real-ip": ipAddress,
  });
}

function cookieHeader(setCookieHeaders: readonly string[]): string {
  return setCookieHeaders
    .map((setCookie) => setCookie.split(";", 1)[0])
    .filter((cookie): cookie is string => cookie !== undefined)
    .join("; ");
}

async function clearFixtures(): Promise<void> {
  if (fixtureUserIds.size > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: [...fixtureUserIds] } },
    });
  }
  if (fixtureOrganisationIds.size > 0) {
    await prisma.organisation.deleteMany({
      where: { id: { in: [...fixtureOrganisationIds] } },
    });
  }
  if (fixtureRateLimitKeys.size > 0) {
    await prisma.rateLimit.deleteMany({
      where: { key: { in: [...fixtureRateLimitKeys] } },
    });
  }

  fixtureUserIds.clear();
  fixtureOrganisationIds.clear();
  fixtureRateLimitKeys.clear();
}

async function createFixtureUser() {
  const organisationId = randomUUID();
  fixtureOrganisationIds.add(organisationId);
  await prisma.organisation.create({
    data: { id: organisationId, name: "Fiktiv utloggningsorganisation" },
  });
  const created = await auth.api.createUser({
    body: {
      name: "Fiktiv Utloggningsperson",
      email: `${randomUUID()}@example.test`,
      password,
      role: UserRole.STAFF_MEMBER,
      data: {
        organisationId,
        professionalTitle: "Fiktiv yrkesroll",
        mustChangePassword: false,
        temporaryCredentialExpiresAt: null,
      },
    },
  });
  fixtureUserIds.add(created.user.id);

  return {
    id: created.user.id,
    email: created.user.email,
    organisationId,
  };
}

async function signIn(email: string, ipAddress: string) {
  const request = new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: authenticationHeaders(ipAddress),
    body: JSON.stringify({ email, password }),
  });
  const response = await applyBetterAuthRoutePolicy((currentRequest) =>
    handleAuditedEmailSignInForTest(currentRequest, {}),
  )(request);

  expect(response.status).toBe(200);
  return authenticationHeaders(
    ipAddress,
    cookieHeader(response.headers.getSetCookie()),
  );
}

async function trustedSession(headers: Headers): Promise<TrustedLogoutSession> {
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  if (!session) throw new Error("Expected a fictional authenticated Session.");

  return {
    sessionId: session.session.id,
    userId: session.session.userId,
    organisationId: session.user.organisationId,
  };
}

async function logoutOperations(userId: string) {
  return prisma.auditOperation.findMany({
    where: { actorUserId: userId, action: "LOGOUT_SUCCEEDED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      actorKind: true,
      actorUserId: true,
      organisationId: true,
      targetType: true,
      targetId: true,
      events: {
        select: { type: true, result: true, resolvedTargetId: true },
      },
    },
  });
}

beforeEach(async () => {
  await clearFixtures();
  vi.restoreAllMocks();
});

afterEach(async () => {
  await clearFixtures();
  vi.restoreAllMocks();
});

describe("audited LOGOUT_SUCCEEDED Session revocation", () => {
  it("removes only the exact Session, clears cookies, and records trusted success", async () => {
    const loginFailedBefore = await prisma.auditOperation.count({
      where: { action: "LOGIN_FAILED" },
    });
    const user = await createFixtureUser();
    const currentHeaders = await signIn(user.email, "192.0.2.180");
    const otherHeaders = await signIn(user.email, "192.0.2.181");
    const current = await trustedSession(currentHeaders);
    const other = await trustedSession(otherHeaders);

    const result = await logoutCurrentSessionForTest(currentHeaders, {});

    expect(result.setCookieHeaders).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /better-auth\.session_token=;.*Max-Age=0.*HttpOnly.*SameSite=Lax/i,
        ),
      ]),
    );
    await expect(
      prisma.session.findUnique({ where: { id: current.sessionId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.session.findUnique({ where: { id: other.sessionId } }),
    ).resolves.toMatchObject({ id: other.sessionId, userId: user.id });
    await expect(logoutOperations(user.id)).resolves.toEqual([
      {
        id: expect.any(String),
        actorKind: "USER",
        actorUserId: user.id,
        organisationId: user.organisationId,
        targetType: "AUTHENTICATION",
        targetId: null,
        events: [
          { type: "OUTCOME", result: "SUCCEEDED", resolvedTargetId: null },
        ],
      },
    ]);
    await expect(
      prisma.auditOperation.count({
        where: { actorUserId: user.id, action: "LOGIN_SUCCEEDED" },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.auditOperation.count({ where: { action: "LOGIN_FAILED" } }),
    ).resolves.toBe(loginFailedBefore);
  });

  it("keeps deletion committed and cookie clearing available when success persistence fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const user = await createFixtureUser();
    const headers = await signIn(user.email, "192.0.2.182");
    const current = await trustedSession(headers);

    const result = await logoutCurrentSessionForTest(headers, {
      async recordSucceededOutcome() {
        throw new Error("fictional outcome persistence detail");
      },
    });

    expect(
      result.setCookieHeaders.some((value) => value.includes("Max-Age=0")),
    ).toBe(true);
    await expect(
      prisma.session.findUnique({ where: { id: current.sessionId } }),
    ).resolves.toBeNull();
    await expect(logoutOperations(user.id)).resolves.toMatchObject([
      { events: [] },
    ]);
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout audit persistence failed."],
    ]);
  });

  it("does not invent success when Better Auth reports success without deleting", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const user = await createFixtureUser();
    const headers = await signIn(user.email, "192.0.2.183");
    const current = await trustedSession(headers);

    const result = await logoutCurrentSessionForTest(headers, {
      async performBetterAuthSignOut() {
        return Response.json({ success: true });
      },
    });

    expect(
      result.setCookieHeaders.some((value) => value.includes("Max-Age=0")),
    ).toBe(true);
    await expect(
      prisma.session.findUnique({ where: { id: current.sessionId } }),
    ).resolves.toMatchObject({ id: current.sessionId });
    await expect(logoutOperations(user.id)).resolves.toMatchObject([
      { events: [{ type: "OUTCOME", result: "FAILED" }] },
    ]);
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout Session deletion failed."],
    ]);
  });

  it("suppresses raw Better Auth lookup errors and emits only Kaul's static message", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const user = await createFixtureUser();
    const headers = await signIn(user.email, "192.0.2.187");
    const current = await trustedSession(headers);
    const rawLookupDetail = `fictional raw Prisma lookup ${current.sessionId} ${user.id} ${user.organisationId} ${headers.get("cookie")}`;
    const failingPrisma = prisma.$extends({
      query: {
        session: {
          async findFirst() {
            throw new Error(rawLookupDetail);
          },
        },
      },
    });
    const trustedSessionAuthentication = createLogoutAuthenticationForTest(
      failingPrisma as unknown as Parameters<
        typeof createLogoutAuthenticationForTest
      >[0],
    );

    const result = await logoutCurrentSessionForTest(headers, {
      trustedSessionAuthentication,
    });

    expect(
      result.setCookieHeaders.some((value) => value.includes("Max-Age=0")),
    ).toBe(true);
    await expect(
      prisma.session.findUnique({ where: { id: current.sessionId } }),
    ).resolves.toMatchObject({ id: current.sessionId });
    await expect(logoutOperations(user.id)).resolves.toEqual([]);
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout Session deletion failed."],
    ]);
    const loggedOutput = JSON.stringify(consoleError.mock.calls);
    expect(loggedOutput).not.toContain(rawLookupDetail);
    expect(loggedOutput).not.toContain(current.sessionId);
    expect(loggedOutput).not.toContain(user.id);
    expect(loggedOutput).not.toContain(user.organisationId);
  });

  it("records FAILED for Prisma's proven post-callback timeout rollback", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const user = await createFixtureUser();
    const headers = await signIn(user.email, "192.0.2.188");
    const current = await trustedSession(headers);
    const transactionExecutor = vi.fn(
      (callback: (transaction: Prisma.TransactionClient) => Promise<void>) =>
        prisma.$transaction(callback, { timeout: 50 }),
    );

    const result = await logoutCurrentSessionForTest(headers, {
      transactionExecutor,
      afterDeletionVerified: () =>
        new Promise((resolve) => setTimeout(resolve, 100)),
    });

    expect(
      result.setCookieHeaders.some((value) => value.includes("Max-Age=0")),
    ).toBe(true);
    await expect(
      prisma.session.findUnique({ where: { id: current.sessionId } }),
    ).resolves.toMatchObject({ id: current.sessionId });
    await expect(logoutOperations(user.id)).resolves.toMatchObject([
      { events: [{ type: "OUTCOME", result: "FAILED" }] },
    ]);
    expect(transactionExecutor).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout Session deletion failed."],
    ]);
  });

  it("records AMBIGUOUS, never success, when commit acknowledgement is unavailable", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const user = await createFixtureUser();
    const headers = await signIn(user.email, "192.0.2.184");
    const current = await trustedSession(headers);

    const unknownExecutor = vi.fn(
      async (
        callback: (transaction: Prisma.TransactionClient) => Promise<void>,
      ): Promise<void> => {
        await prisma.$transaction(callback, { timeout: 30_000 });
        throw new Prisma.PrismaClientUnknownRequestError(
          "Fictional unresolvable commit acknowledgement.",
          { clientVersion: Prisma.prismaVersion.client },
        );
      },
    );

    const result = await logoutCurrentSessionForTest(headers, {
      transactionExecutor: unknownExecutor,
    });

    expect(
      result.setCookieHeaders.some((value) => value.includes("Max-Age=0")),
    ).toBe(true);
    await expect(
      prisma.session.findUnique({ where: { id: current.sessionId } }),
    ).resolves.toBeNull();
    await expect(logoutOperations(user.id)).resolves.toMatchObject([
      { events: [{ type: "OUTCOME", result: "AMBIGUOUS" }] },
    ]);
    expect(unknownExecutor).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout Session deletion state is ambiguous."],
    ]);
  });

  it("makes stale and double logout cookie-idempotent without a second audit success", async () => {
    const user = await createFixtureUser();
    const headers = await signIn(user.email, "192.0.2.185");

    const first = await logoutCurrentSessionForTest(headers, {});
    const second = await logoutCurrentSessionForTest(headers, {});

    expect(first.setCookieHeaders.length).toBeGreaterThan(0);
    expect(second.setCookieHeaders.length).toBeGreaterThan(0);
    await expect(logoutOperations(user.id)).resolves.toMatchObject([
      { events: [{ result: "SUCCEEDED" }] },
    ]);
  });

  it("serializes concurrent attempts so exactly one can claim deletion", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const user = await createFixtureUser();
    const headers = await signIn(user.email, "192.0.2.186");
    const operationIds = [
      generateAuditOperationId(),
      generateAuditOperationId(),
    ] as const;
    let arrivals = 0;
    let release!: () => void;
    const bothIntentsPersisted = new Promise<void>((resolve) => {
      release = resolve;
    });

    function concurrentDependencies(
      operationId: string,
    ): LogoutTestDependencies {
      return {
        operationId,
        async createIntent(input) {
          const intent = await createLogoutSucceededAuditIntent(input);
          arrivals += 1;
          if (arrivals === 2) release();
          await bothIntentsPersisted;
          return intent;
        },
      };
    }

    const results = await Promise.all(
      operationIds.map((operationId) =>
        logoutCurrentSessionForTest(
          new Headers(headers),
          concurrentDependencies(operationId),
        ),
      ),
    );

    expect(results.every((result) => result.setCookieHeaders.length > 0)).toBe(
      true,
    );
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    const operations = await logoutOperations(user.id);
    expect(operations).toHaveLength(2);
    expect(
      operations.filter(({ events }) => events[0]?.result === "SUCCEEDED"),
    ).toHaveLength(1);
    expect(
      operations.filter(({ events }) => events[0]?.result === "FAILED"),
    ).toHaveLength(1);
    expect(
      operations.some(({ events }) => events[0]?.result === "AMBIGUOUS"),
    ).toBe(false);
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout Session deletion failed."],
    ]);
  });
});
