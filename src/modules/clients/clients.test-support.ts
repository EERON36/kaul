import type { AdministratorUser } from "../users/authorization";
import type {
  CreateAssignmentInput,
  CreateClientInput,
  EndAssignmentInput,
  UpdateClientInput,
} from "./client-input";
import {
  createAssignmentInternal,
  createClientInternal,
  endAssignmentInternal,
  updateClientInternal,
  type ClientManagementTestDependencies,
} from "./clients-internal";

function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Client test support is available only in tests.");
  }
}

export function createClientForTest(
  input: CreateClientInput,
  actor: AdministratorUser,
  dependencies: ClientManagementTestDependencies,
) {
  assertTestEnvironment();
  return createClientInternal(input, actor, dependencies);
}

export function createAssignmentForTest(
  input: CreateAssignmentInput,
  actor: AdministratorUser,
  dependencies: ClientManagementTestDependencies,
) {
  assertTestEnvironment();
  return createAssignmentInternal(input, actor, dependencies);
}

export function updateClientForTest(
  input: UpdateClientInput,
  actor: AdministratorUser,
  dependencies: ClientManagementTestDependencies,
) {
  assertTestEnvironment();
  return updateClientInternal(input, actor, dependencies);
}

export function endAssignmentForTest(
  input: EndAssignmentInput,
  actor: AdministratorUser,
  dependencies: ClientManagementTestDependencies,
) {
  assertTestEnvironment();
  return endAssignmentInternal(input, actor, dependencies);
}
