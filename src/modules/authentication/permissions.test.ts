import { describe, expect, it } from "vitest";

import { administratorRole, staffMemberRole } from "./permissions";

const forbiddenUserActions = [
  "set-role",
  "set-email",
  "update",
  "delete",
  "impersonate",
  "impersonate-admins",
] as const;

describe("Better Auth Admin permissions", () => {
  it("grants administrators only the approved operations", () => {
    expect(administratorRole.statements).toEqual({
      user: ["create", "list", "get", "set-password", "ban"],
      session: ["list", "revoke"],
    });

    for (const action of forbiddenUserActions) {
      expect(administratorRole.authorize({ user: [action] }).success).toBe(
        false,
      );
    }

    expect(administratorRole.authorize({ session: ["delete"] }).success).toBe(
      false,
    );
  });

  it("grants staff members no Admin-plugin operations", () => {
    expect(staffMemberRole.statements).toEqual({ user: [], session: [] });
    expect(staffMemberRole.authorize({ user: ["get"] }).success).toBe(false);
    expect(staffMemberRole.authorize({ session: ["list"] }).success).toBe(
      false,
    );
  });
});
