import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { auth } from "./auth";
import { SESSION_LIFETIME_SECONDS } from "./session-policy";

const password = "Fictional Session lifetime passphrase 2030";
const lifetimeMilliseconds = SESSION_LIFETIME_SECONDS * 1_000;
const lifetimeToleranceMilliseconds = 2_000;

type FixtureOptions = Readonly<{
  role: UserRole;
  mustChangePassword?: boolean;
}>;

async function clearAuthenticationFixtures(): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.rateLimit.deleteMany();
}

async function createFixtureUser(options: FixtureOptions) {
  const organisationId = randomUUID();
  const email = `${randomUUID()}@example.test`;

  await prisma.organisation.create({
    data: {
      id: organisationId,
      name: "Fiktiv sessionsorganisation",
    },
  });
  const created = await auth.api.createUser({
    body: {
      name: "Fiktiv Sessionsperson",
      email,
      password,
      role: options.role,
      data: {
        organisationId,
        professionalTitle: "Fiktiv yrkesroll",
        mustChangePassword: options.mustChangePassword ?? false,
        temporaryCredentialExpiresAt: options.mustChangePassword
          ? new Date("2099-01-01T00:00:00.000Z")
          : null,
      },
    },
  });

  return { email, userId: created.user.id };
}

function authenticationHeaders(ipAddress: string, cookie?: string): Headers {
  return new Headers({
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
    origin: "http://localhost:3000",
    "x-real-ip": ipAddress,
  });
}

async function signIn(options: {
  email: string;
  ipAddress: string;
  rememberMe?: boolean;
}): Promise<Response> {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: authenticationHeaders(options.ipAddress),
      body: JSON.stringify({
        email: options.email,
        password,
        ...(options.rememberMe === undefined
          ? {}
          : { rememberMe: options.rememberMe }),
      }),
    }),
  );
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";", 1)[0])
    .filter((cookie): cookie is string => cookie !== undefined)
    .join("; ");
}

function sessionTokenCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .find((setCookie) => setCookie.includes("session_token="));

  if (!cookie) throw new Error("Expected Better Auth Session cookie.");
  return cookie;
}

function expectTwelveHourLifetime(session: {
  createdAt: Date;
  expiresAt: Date;
}): void {
  const lifetime = session.expiresAt.getTime() - session.createdAt.getTime();

  expect(lifetime).toBeGreaterThanOrEqual(
    lifetimeMilliseconds - lifetimeToleranceMilliseconds,
  );
  expect(lifetime).toBeLessThanOrEqual(lifetimeMilliseconds);
  expect(lifetime).toBeLessThan(24 * 60 * 60 * 1_000 - 60_000);
}

beforeEach(clearAuthenticationFixtures);
afterEach(clearAuthenticationFixtures);

describe("absolute Session lifetime", () => {
  it.each([
    ["Administrator", UserRole.ADMINISTRATOR, false, "192.0.2.10"],
    ["Staff Member", UserRole.STAFF_MEMBER, false, "192.0.2.11"],
    ["forced password change", UserRole.STAFF_MEMBER, true, "192.0.2.12"],
  ] as const)(
    "creates an approximately twelve-hour Session for %s",
    async (_label, role, mustChangePassword, ipAddress) => {
      const user = await createFixtureUser({ role, mustChangePassword });
      const response = await signIn({ email: user.email, ipAddress });

      expect(response.status).toBe(200);
      const session = await prisma.session.findFirstOrThrow({
        where: { userId: user.userId },
      });
      expectTwelveHourLifetime(session);

      const setCookie = sessionTokenCookie(response);
      expect(setCookie).toMatch(/Max-Age=43200(?:;|$)/i);
      expect(setCookie).not.toMatch(/Max-Age=86400(?:;|$)/i);
      const authenticated = await auth.api.getSession({
        headers: authenticationHeaders(ipAddress, cookieHeader(response)),
        query: { disableCookieCache: true },
      });
      expect(authenticated?.session.id).toBe(session.id);
      expect(authenticated?.session.userId).toBe(user.userId);
    },
  );

  it("does not allow a direct rememberMe false request to extend the Session", async () => {
    const user = await createFixtureUser({ role: UserRole.STAFF_MEMBER });
    const response = await signIn({
      email: user.email,
      ipAddress: "192.0.2.20",
      rememberMe: false,
    });

    expect(response.status).toBe(200);
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: user.userId },
    });
    expectTwelveHourLifetime(session);
    expect(sessionTokenCookie(response)).not.toMatch(/Max-Age=/i);
  });

  it("does not refresh expiry and rejects the cookie after database expiry", async () => {
    const user = await createFixtureUser({ role: UserRole.ADMINISTRATOR });
    const response = await signIn({
      email: user.email,
      ipAddress: "192.0.2.30",
    });
    const headers = authenticationHeaders("192.0.2.30", cookieHeader(response));
    const originalSession = await prisma.session.findFirstOrThrow({
      where: { userId: user.userId },
    });

    await expect(
      auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
      }),
    ).resolves.toMatchObject({
      session: { id: originalSession.id, userId: user.userId },
    });
    await expect(
      prisma.session.findUniqueOrThrow({
        where: { id: originalSession.id },
        select: { expiresAt: true },
      }),
    ).resolves.toEqual({ expiresAt: originalSession.expiresAt });

    await prisma.session.update({
      where: { id: originalSession.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(
      auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
      }),
    ).resolves.toBeNull();
  });
});
