import { describe, expect, it, vi } from "vitest";

import { UserRole } from "../../generated/prisma/client";

import {
  createStaffMemberInputSchema,
  staffPasswordResetInputSchema,
  staffMemberStatusInputSchema,
} from "./staff-management-input";
import {
  isStaffPasswordResetEligibleForTest,
  selectStaffMutationFailureOutcomeForTest,
} from "./staff-management.test-support";

describe("staff management input", () => {
  const currentTime = new Date("2032-02-03T04:05:06.000Z");

  it.each([
    ["active Staff without an outstanding reset", false, null, false, true],
    [
      "active Staff with an outstanding reset",
      true,
      new Date(currentTime.getTime() + 1),
      false,
      false,
    ],
    [
      "active Staff with an expired reset",
      true,
      new Date(currentTime.getTime() - 1),
      false,
      true,
    ],
    [
      "active Staff with a stale future expiry",
      false,
      new Date(currentTime.getTime() + 1),
      false,
      true,
    ],
    ["inactive Staff", false, null, true, false],
  ] as const)(
    "derives password-reset UI eligibility for %s",
    (
      _label,
      mustChangePassword,
      temporaryCredentialExpiresAt,
      banned,
      expected,
    ) => {
      expect(
        isStaffPasswordResetEligibleForTest(
          {
            role: UserRole.STAFF_MEMBER,
            banned,
            mustChangePassword,
            temporaryCredentialExpiresAt,
          },
          currentTime,
        ),
      ).toBe(expected);
    },
  );

  it("excludes Administrators from password-reset UI eligibility", () => {
    expect(
      isStaffPasswordResetEligibleForTest(
        {
          role: UserRole.ADMINISTRATOR,
          banned: false,
          mustChangePassword: false,
          temporaryCredentialExpiresAt: null,
        },
        currentTime,
      ),
    ).toBe(false);
  });

  it("classifies only uncertain post-callback failures as AMBIGUOUS", () => {
    expect(selectStaffMutationFailureOutcomeForTest(false)).toBe("FAILED");
    expect(selectStaffMutationFailureOutcomeForTest(true)).toBe("AMBIGUOUS");
  });

  it("accepts only the four create-operation fields", () => {
    const input = {
      operationId: "92a3d09e-dbe8-453a-b8db-21905e8411d3",
      name: "Fiktiv Medarbetare",
      email: "staff@example.test",
      professionalTitle: "Fiktiv behandlare",
    };

    expect(createStaffMemberInputSchema.parse(input)).toEqual(input);
    expect(() =>
      createStaffMemberInputSchema.parse({
        ...input,
        role: "ADMINISTRATOR",
      }),
    ).toThrow();
    expect(() =>
      createStaffMemberInputSchema.parse({
        ...input,
        organisationId: "browser-controlled",
        password: "browser-controlled",
        mustChangePassword: false,
      }),
    ).toThrow();
  });

  it("accepts only operation and target identifiers for status changes", () => {
    const input = {
      operationId: "99eb11ad-ef00-442c-8431-3f4fe4c7502d",
      targetUserId: "fictional-user-id",
    };

    expect(staffMemberStatusInputSchema.parse(input)).toEqual(input);
    expect(() =>
      staffMemberStatusInputSchema.parse({ ...input, banned: false }),
    ).toThrow();
  });

  it("accepts only operation and target identifiers for password reset", () => {
    const input = {
      operationId: "99eb11ad-ef00-442c-8431-3f4fe4c7502d",
      targetUserId: "fictional-user-id",
    };

    expect(staffPasswordResetInputSchema.parse(input)).toEqual(input);
    for (const extra of [
      { password: "browser-controlled" },
      { organisationId: "browser-controlled" },
      { role: "ADMINISTRATOR" },
      { action: "USER_SESSIONS_REVOKED" },
      { result: "SUCCEEDED" },
    ]) {
      expect(() =>
        staffPasswordResetInputSchema.parse({ ...input, ...extra }),
      ).toThrow();
    }
  });

  it("keeps test support unavailable outside the test environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { createStaffMemberForTest } =
      await import("./staff-management.test-support");

    expect(() =>
      createStaffMemberForTest(
        {
          operationId: "7b3fe806-f0ae-44b9-87a8-a2632ef9b73f",
          name: "Fiktiv Medarbetare",
          email: "staff@example.test",
          professionalTitle: "Fiktiv behandlare",
        },
        {
          userId: "administrator-id",
          name: "Fiktiv Administratör",
          email: "administrator@example.test",
          role: "ADMINISTRATOR",
          organisationId: "organisation-id",
          organisationName: "Fiktiva Omsorgen",
          professionalTitle: "Fiktiv verksamhetsansvarig",
          mustChangePassword: false,
          credentialState: "APPLICATION_ALLOWED",
        },
        new Headers(),
        {},
      ),
    ).toThrow("available only in tests");
    vi.unstubAllEnvs();
  });

  it("keeps password-reset test support unavailable outside tests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { resetStaffPasswordForTest } =
      await import("./staff-password-reset.test-support");

    expect(() =>
      resetStaffPasswordForTest(
        {
          operationId: "7b3fe806-f0ae-44b9-87a8-a2632ef9b73f",
          targetUserId: "fictional-user-id",
        },
        {
          userId: "administrator-id",
          name: "Fiktiv Administratör",
          email: "administrator@example.test",
          role: "ADMINISTRATOR",
          organisationId: "organisation-id",
          organisationName: "Fiktiva Omsorgen",
          professionalTitle: "Fiktiv verksamhetsansvarig",
          mustChangePassword: false,
          credentialState: "APPLICATION_ALLOWED",
        },
        new Headers(),
        {},
      ),
    ).toThrow("available only in tests");
    vi.unstubAllEnvs();
  });
});
