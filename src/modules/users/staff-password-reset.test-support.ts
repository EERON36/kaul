import type { AdministratorUser } from "./authorization";
import type { StaffPasswordResetInput } from "./staff-management-input";
import {
  resetStaffPasswordInternal,
  type StaffPasswordResetTestDependencies,
} from "./staff-password-reset-internal";

export function resetStaffPasswordForTest(
  input: StaffPasswordResetInput,
  actor: AdministratorUser,
  headers: Headers,
  dependencies: StaffPasswordResetTestDependencies,
) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "Staff password reset test support is available only in tests.",
    );
  }

  return resetStaffPasswordInternal(input, actor, headers, dependencies);
}
