import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("./auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("../../lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));

import {
  AUTHENTICATION_GUARD_ERROR_MESSAGE,
  AuthenticationGuardError,
  requireApplicationUser,
  requireAuthenticatedUser,
} from "./guards";

const requestHeaders = new Headers({
  cookie: "fictional-session-cookie=not-a-real-token",
  "x-kaul-organisation-id": "browser-controlled-organisation",
  "x-kaul-role": "ADMINISTRATOR",
});

const databaseUser = {
  id: "user_database",
  name: "Fiktiv Testperson",
  email: "testperson@example.test",
  role: "STAFF_MEMBER" as const,
  banned: false,
  organisationId: "organisation_database",
  professionalTitle: "Fiktiv behandlare",
  mustChangePassword: false,
  temporaryCredentialExpiresAt: null,
  organisation: { id: "organisation_database" },
};

function expectGuardError(
  result: Promise<unknown>,
  code: AuthenticationGuardError["code"],
) {
  return expect(result).rejects.toMatchObject({
    name: "AuthenticationGuardError",
    message: AUTHENTICATION_GUARD_ERROR_MESSAGE,
    code,
  });
}

beforeEach(() => {
  mocks.headers.mockResolvedValue(requestHeaders);
  mocks.getSession.mockResolvedValue({
    session: { userId: databaseUser.id },
    user: {
      id: databaseUser.id,
      role: "ADMINISTRATOR",
      organisationId: "browser-controlled-organisation",
    },
  });
  mocks.findUnique.mockResolvedValue(databaseUser);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("requireAuthenticatedUser", () => {
  it("denies a missing session before querying the application user", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expectGuardError(requireAuthenticatedUser(), "UNAUTHENTICATED");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("loads current identity and access fields only from PostgreSQL", async () => {
    const user = await requireAuthenticatedUser();

    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: databaseUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        organisationId: true,
        professionalTitle: true,
        mustChangePassword: true,
        temporaryCredentialExpiresAt: true,
        organisation: { select: { id: true } },
      },
    });
    expect(user).toEqual({
      userId: databaseUser.id,
      name: databaseUser.name,
      email: databaseUser.email,
      role: "STAFF_MEMBER",
      organisationId: databaseUser.organisationId,
      professionalTitle: databaseUser.professionalTitle,
      mustChangePassword: false,
      credentialState: "APPLICATION_ALLOWED",
    });
    expect(Object.keys(user).sort()).toEqual(
      [
        "credentialState",
        "email",
        "mustChangePassword",
        "name",
        "organisationId",
        "professionalTitle",
        "role",
        "userId",
      ].sort(),
    );
  });

  it("does not trust browser or cached session role and organisation fields", async () => {
    const user = await requireAuthenticatedUser();

    expect(user.role).toBe("STAFF_MEMBER");
    expect(user.organisationId).toBe("organisation_database");
  });

  it("denies a session whose database user no longer exists", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expectGuardError(requireAuthenticatedUser(), "UNAUTHENTICATED");
  });

  it("denies only an explicitly banned account", async () => {
    mocks.findUnique.mockResolvedValue({ ...databaseUser, banned: true });

    await expectGuardError(requireAuthenticatedUser(), "ACCOUNT_INACTIVE");
  });

  it.each([false, null])("treats banned=%s as active", async (banned) => {
    mocks.findUnique.mockResolvedValue({ ...databaseUser, banned });

    await expect(requireAuthenticatedUser()).resolves.toMatchObject({
      userId: databaseUser.id,
      credentialState: "APPLICATION_ALLOWED",
    });
  });

  it.each([
    ["empty ownership", { organisationId: "" }],
    ["mismatched ownership", { organisation: { id: "another_organisation" } }],
  ])("denies %s", async (_description, inconsistentFields) => {
    mocks.findUnique.mockResolvedValue({
      ...databaseUser,
      ...inconsistentFields,
    });

    await expectGuardError(
      requireAuthenticatedUser(),
      "INCONSISTENT_ORGANISATION",
    );
  });

  it("returns the password-change state for a current temporary credential", async () => {
    mocks.findUnique.mockResolvedValue({
      ...databaseUser,
      mustChangePassword: true,
      temporaryCredentialExpiresAt: new Date("2026-08-08T12:01:00Z"),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T12:00:00Z"));

    await expect(requireAuthenticatedUser()).resolves.toMatchObject({
      mustChangePassword: true,
      credentialState: "PASSWORD_CHANGE_REQUIRED",
    });
  });

  it("marks a temporary credential expired at the exact expiry instant", async () => {
    const expiry = new Date("2026-08-08T12:00:00Z");
    mocks.findUnique.mockResolvedValue({
      ...databaseUser,
      mustChangePassword: true,
      temporaryCredentialExpiresAt: expiry,
    });
    vi.useFakeTimers();
    vi.setSystemTime(expiry);

    await expect(requireAuthenticatedUser()).resolves.toMatchObject({
      mustChangePassword: true,
      credentialState: "TEMPORARY_CREDENTIAL_EXPIRED",
    });
  });
});

describe("requireApplicationUser", () => {
  it("denies application access until password change is complete", async () => {
    mocks.findUnique.mockResolvedValue({
      ...databaseUser,
      mustChangePassword: true,
    });

    await expectGuardError(
      requireApplicationUser(),
      "PASSWORD_CHANGE_REQUIRED",
    );
  });

  it("denies expired temporary credentials but does not prevent session creation in Slice 2", async () => {
    mocks.findUnique.mockResolvedValue({
      ...databaseUser,
      mustChangePassword: true,
      temporaryCredentialExpiresAt: new Date("2026-08-08T12:00:00Z"),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T12:00:01Z"));

    await expectGuardError(
      requireApplicationUser(),
      "TEMPORARY_CREDENTIAL_EXPIRED",
    );
    expect(mocks.getSession).toHaveBeenCalledOnce();
  });

  it("ignores a stale temporary expiry after password change is complete", async () => {
    mocks.findUnique.mockResolvedValue({
      ...databaseUser,
      temporaryCredentialExpiresAt: new Date("2020-01-01T00:00:00Z"),
    });

    await expect(requireApplicationUser()).resolves.toMatchObject({
      mustChangePassword: false,
      credentialState: "APPLICATION_ALLOWED",
    });
  });

  it("returns safe generic errors without authentication material", async () => {
    mocks.getSession.mockResolvedValue(null);

    const error = await requireApplicationUser().catch((reason: unknown) =>
      reason instanceof AuthenticationGuardError ? reason : undefined,
    );

    expect(error).toBeInstanceOf(AuthenticationGuardError);
    expect(error).toMatchObject({
      code: "UNAUTHENTICATED",
      message: AUTHENTICATION_GUARD_ERROR_MESSAGE,
    });
    expect(JSON.stringify(error)).toBe('{"code":"UNAUTHENTICATED"}');
    expect(String(error)).not.toContain("cookie");
    expect(String(error)).not.toContain(databaseUser.id);
  });
});
