import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const USER_ROLES = ["ADMINISTRATOR", "STAFF_MEMBER"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const adminAccessControl = createAccessControl(defaultStatements);

export const administratorRole = adminAccessControl.newRole({
  user: ["create", "list", "get", "set-password", "ban"],
  session: ["list", "revoke"],
});

export const staffMemberRole = adminAccessControl.newRole({
  user: [],
  session: [],
});

export const adminRoles = {
  ADMINISTRATOR: administratorRole,
  STAFF_MEMBER: staffMemberRole,
};
