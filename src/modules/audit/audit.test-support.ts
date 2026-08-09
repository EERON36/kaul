import { auditOperationIdSchema } from "./audit-vocabulary";
import {
  requestPasswordChangedIntentPersistenceFailure,
  resetAuditTestState,
  throwIfPasswordChangedIntentPersistenceMustFail,
} from "./audit-test-state";

function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Audit test support requires NODE_ENV=test.");
  }
}

export function failPasswordChangedIntentPersistenceForOperationForTest(
  operationId: string,
): void {
  assertTestEnvironment();
  const parsed = auditOperationIdSchema.parse(operationId);
  requestPasswordChangedIntentPersistenceFailure(parsed);
}

export function checkPasswordChangedIntentPersistenceFaultForTest(
  operationId: string,
): void {
  assertTestEnvironment();
  throwIfPasswordChangedIntentPersistenceMustFail(
    "PASSWORD_CHANGED",
    operationId,
  );
}

export function resetAuditTestStateForTest(): void {
  assertTestEnvironment();
  resetAuditTestState();
}
