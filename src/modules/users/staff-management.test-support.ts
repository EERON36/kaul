import type { AdministratorUser } from "./authorization";
import {
  createStaffMemberInternal,
  deactivateStaffMemberInternal,
  reactivateStaffMemberInternal,
  selectStaffMutationFailureOutcome,
  type StaffManagementTestDependencies,
} from "./staff-management-internal";
import type {
  CreateStaffMemberInput,
  StaffMemberStatusInput,
} from "./staff-management-input";

function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "Staff management test support is available only in tests.",
    );
  }
}

export function createStaffMemberForTest(
  input: CreateStaffMemberInput,
  actor: AdministratorUser,
  headers: Headers,
  dependencies: StaffManagementTestDependencies,
) {
  assertTestEnvironment();
  return createStaffMemberInternal(input, actor, headers, dependencies);
}

export function deactivateStaffMemberForTest(
  input: StaffMemberStatusInput,
  actor: AdministratorUser,
  headers: Headers,
  dependencies: StaffManagementTestDependencies,
) {
  assertTestEnvironment();
  return deactivateStaffMemberInternal(input, actor, headers, dependencies);
}

export function reactivateStaffMemberForTest(
  input: StaffMemberStatusInput,
  actor: AdministratorUser,
  headers: Headers,
  dependencies: StaffManagementTestDependencies,
) {
  assertTestEnvironment();
  return reactivateStaffMemberInternal(input, actor, headers, dependencies);
}

export function selectStaffMutationFailureOutcomeForTest(
  transactionCallbackCompleted: boolean,
) {
  assertTestEnvironment();
  return selectStaffMutationFailureOutcome(transactionCallbackCompleted);
}
