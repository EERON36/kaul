let passwordChangedOperationIdToFail: string | null = null;

export function requestPasswordChangedIntentPersistenceFailure(
  operationId: string,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Audit test fault state requires NODE_ENV=test.");
  }
  passwordChangedOperationIdToFail = operationId;
}

export function throwIfPasswordChangedIntentPersistenceMustFail(
  action: string,
  operationId: string,
): void {
  if (
    process.env.NODE_ENV === "test" &&
    action === "PASSWORD_CHANGED" &&
    passwordChangedOperationIdToFail === operationId
  ) {
    passwordChangedOperationIdToFail = null;
    throw new Error(
      "Injected password-change audit intent persistence failure.",
    );
  }
}

export function resetAuditTestState(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Audit test fault state requires NODE_ENV=test.");
  }
  passwordChangedOperationIdToFail = null;
}
