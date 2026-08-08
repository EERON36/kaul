import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApplicationUser: vi.fn(),
}));

vi.mock("../authentication/guards", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../authentication/guards")>();

  return {
    ...actual,
    requireApplicationUser: mocks.requireApplicationUser,
  };
});

import {
  AUTHENTICATION_GUARD_ERROR_MESSAGE,
  AuthenticationGuardError,
} from "../authentication/guards";
import { requireAdministrator } from "./authorization";

const applicationUser = {
  userId: "user_database",
  name: "Fiktiv Testperson",
  email: "testperson@example.test",
  role: "STAFF_MEMBER" as const,
  organisationId: "organisation_database",
  professionalTitle: "Fiktiv behandlare",
  mustChangePassword: false as const,
  credentialState: "APPLICATION_ALLOWED" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApplicationUser.mockResolvedValue(applicationUser);
});

describe("requireAdministrator", () => {
  it("denies a Staff Member with a generic forbidden error", async () => {
    await expect(requireAdministrator()).rejects.toMatchObject({
      name: "AuthenticationGuardError",
      message: AUTHENTICATION_GUARD_ERROR_MESSAGE,
      code: "FORBIDDEN",
    });
    await expect(requireAdministrator()).rejects.toBeInstanceOf(
      AuthenticationGuardError,
    );
    expect(mocks.requireApplicationUser).toHaveBeenCalledWith();
  });

  it("returns the application context for the exact Administrator role", async () => {
    const administrator = {
      ...applicationUser,
      role: "ADMINISTRATOR" as const,
    };
    mocks.requireApplicationUser.mockResolvedValue(administrator);

    await expect(requireAdministrator()).resolves.toBe(administrator);
    expect(mocks.requireApplicationUser).toHaveBeenCalledWith();
  });
});
