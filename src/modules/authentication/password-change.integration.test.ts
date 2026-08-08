import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestContext.headers),
}));

import { UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { auth } from "./auth";
import {
  AuthenticationGuardError,
  requireApplicationUser,
  requireAuthenticatedUser,
} from "./guards";
import { changeForcedPasswordForTest } from "./password-change.test-support";

const temporaryPassword = "Fictional temporary password 2030";
const replacementPassword = "Fictional replacement passphrase 2030";
const alternativePassword = "Alternative fictional passphrase 2030";
const futureExpiry = new Date("2030-01-03T03:04:05.000Z");
const currentTime = new Date("2030-01-02T03:04:05.000Z");

async function clearAuthenticationFoundation(): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.rateLimit.deleteMany();
}

function authenticationHeaders(ipAddress: string, cookie?: string) {
  return new Headers({
    ...(cookie ? { cookie } : {}),
    origin: "http://localhost:3000",
    "x-real-ip": ipAddress,
  });
}

function cookiesFromResponse(response: Response): string | undefined {
  const cookies = response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";", 1)[0])
    .filter((cookie): cookie is string => cookie !== undefined);

  return cookies.length > 0 ? cookies.join("; ") : undefined;
}

function cookiesFromSetCookieHeaders(
  setCookieHeaders: readonly string[],
): string {
  return setCookieHeaders
    .map((setCookie) => setCookie.split(";", 1)[0])
    .filter((cookie): cookie is string => cookie !== undefined)
    .join("; ");
}

async function createForcedChangeUser(options?: {
  banned?: boolean | null;
  expiry?: Date | null;
}) {
  const organisationId = randomUUID();
  const email = `${randomUUID()}@example.test`;

  await prisma.organisation.create({
    data: { id: organisationId, name: "Fiktiv lösenordsorganisation" },
  });
  const created = await auth.api.createUser({
    body: {
      name: "Fiktiv Lösenordsperson",
      email,
      password: temporaryPassword,
      role: UserRole.ADMINISTRATOR,
      data: {
        organisationId,
        professionalTitle: "Fiktiv verksamhetsansvarig",
        mustChangePassword: true,
        temporaryCredentialExpiresAt: options?.expiry ?? futureExpiry,
      },
    },
  });

  if (options && "banned" in options) {
    await prisma.user.update({
      where: { id: created.user.id },
      data: { banned: options.banned },
    });
  }

  return { email, userId: created.user.id };
}

async function signIn(
  email: string,
  password: string,
  ipAddress: string,
): Promise<Response> {
  return auth.api.signInEmail({
    body: { email, password, rememberMe: false },
    headers: authenticationHeaders(ipAddress),
    asResponse: true,
  });
}

beforeEach(async () => {
  await clearAuthenticationFoundation();
  requestContext.headers = new Headers();
});

afterEach(async () => {
  await clearAuthenticationFoundation();
  requestContext.headers = new Headers();
});

describe("expired temporary credential session policy", () => {
  it("creates no session or usable guard context at the expiry boundary", async () => {
    const { email, userId } = await createForcedChangeUser({
      expiry: new Date("2020-01-01T00:00:00Z"),
    });
    const response = await signIn(email, temporaryPassword, "192.0.2.101");

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(0);
    await expect(requireAuthenticatedUser()).rejects.toBeInstanceOf(
      AuthenticationGuardError,
    );
    await expect(requireApplicationUser()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("forced password change transaction", () => {
  it("rolls password, flags, and sessions back after a post-authentication failure", async () => {
    const { email, userId } = await createForcedChangeUser();
    const firstSignIn = await signIn(email, temporaryPassword, "192.0.2.102");
    const secondSignIn = await signIn(email, temporaryPassword, "192.0.2.103");
    const currentCookie = cookiesFromResponse(firstSignIn);
    expect(firstSignIn.status).toBe(200);
    expect(secondSignIn.status).toBe(200);
    expect(currentCookie).toBeDefined();
    requestContext.headers = authenticationHeaders(
      "192.0.2.102",
      currentCookie,
    );
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(2);

    await expect(
      changeForcedPasswordForTest(
        {
          currentPassword: temporaryPassword,
          newPassword: replacementPassword,
          confirmPassword: replacementPassword,
        },
        {
          currentTime: () => currentTime,
          afterAuthenticationChange: () => {
            throw new Error("Deliberate post-password-change failure");
          },
        },
      ),
    ).rejects.toThrow("Deliberate post-password-change failure");

    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          mustChangePassword: true,
          temporaryCredentialExpiresAt: true,
        },
      }),
    ).resolves.toEqual({
      mustChangePassword: true,
      temporaryCredentialExpiresAt: futureExpiry,
    });
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(2);
    await expect(requireAuthenticatedUser()).resolves.toMatchObject({
      credentialState: "PASSWORD_CHANGE_REQUIRED",
    });
    await expect(
      signIn(email, temporaryPassword, "192.0.2.104"),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      signIn(email, replacementPassword, "192.0.2.105"),
    ).resolves.toMatchObject({ status: 401 });
  });

  it("commits one coherent password, state, and replacement session", async () => {
    const { email, userId } = await createForcedChangeUser();
    const firstSignIn = await signIn(email, temporaryPassword, "192.0.2.106");
    await signIn(email, temporaryPassword, "192.0.2.107");
    const currentCookie = cookiesFromResponse(firstSignIn);
    expect(currentCookie).toBeDefined();
    requestContext.headers = authenticationHeaders(
      "192.0.2.106",
      currentCookie,
    );
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(2);

    const result = await changeForcedPasswordForTest(
      {
        currentPassword: temporaryPassword,
        newPassword: replacementPassword,
        confirmPassword: replacementPassword,
      },
      { currentTime: () => currentTime },
    );
    expect(result.setCookieHeaders.length).toBeGreaterThanOrEqual(2);
    const replacementCookie = cookiesFromSetCookieHeaders(
      result.setCookieHeaders,
    );
    requestContext.headers = authenticationHeaders(
      "192.0.2.106",
      replacementCookie,
    );

    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          mustChangePassword: true,
          temporaryCredentialExpiresAt: true,
        },
      }),
    ).resolves.toEqual({
      mustChangePassword: false,
      temporaryCredentialExpiresAt: null,
    });
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(1);
    await expect(requireApplicationUser()).resolves.toMatchObject({
      userId,
      credentialState: "APPLICATION_ALLOWED",
    });
    await expect(
      signIn(email, temporaryPassword, "192.0.2.108"),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      signIn(email, replacementPassword, "192.0.2.109"),
    ).resolves.toMatchObject({ status: 200 });
  });

  it("serializes concurrent attempts into exactly one coherent outcome", async () => {
    const { email, userId } = await createForcedChangeUser();
    const initialSignIn = await signIn(email, temporaryPassword, "192.0.2.110");
    const currentCookie = cookiesFromResponse(initialSignIn);
    expect(currentCookie).toBeDefined();
    requestContext.headers = authenticationHeaders(
      "192.0.2.110",
      currentCookie,
    );

    const attempts = await Promise.allSettled([
      changeForcedPasswordForTest(
        {
          currentPassword: temporaryPassword,
          newPassword: replacementPassword,
          confirmPassword: replacementPassword,
        },
        { currentTime: () => currentTime },
      ),
      changeForcedPasswordForTest(
        {
          currentPassword: temporaryPassword,
          newPassword: alternativePassword,
          confirmPassword: alternativePassword,
        },
        { currentTime: () => currentTime },
      ),
    ]);
    const fulfilled = attempts.filter(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<{
        setCookieHeaders: readonly string[];
      }> => attempt.status === "fulfilled",
    );

    expect(fulfilled).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          mustChangePassword: true,
          temporaryCredentialExpiresAt: true,
        },
      }),
    ).resolves.toEqual({
      mustChangePassword: false,
      temporaryCredentialExpiresAt: null,
    });
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(1);

    const successfulPassword =
      attempts[0]?.status === "fulfilled"
        ? replacementPassword
        : alternativePassword;
    const rejectedPassword =
      successfulPassword === replacementPassword
        ? alternativePassword
        : replacementPassword;
    await expect(
      signIn(email, successfulPassword, "192.0.2.111"),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      signIn(email, rejectedPassword, "192.0.2.112"),
    ).resolves.toMatchObject({ status: 401 });

    requestContext.headers = authenticationHeaders(
      "192.0.2.110",
      cookiesFromSetCookieHeaders(fulfilled[0].value.setCookieHeaders),
    );
    await expect(requireApplicationUser()).resolves.toMatchObject({ userId });
  });
});
