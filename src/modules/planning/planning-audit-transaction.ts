export type PlanningAuditTransactionVerification<TResult> =
  | Readonly<{ state: "COMPLETED"; value: TResult }>
  | Readonly<{ state: "ROLLED_BACK" }>
  | Readonly<{ state: "UNKNOWN" }>;

export type PlanningAuditTransactionResult<TResult> =
  | Readonly<{ state: "COMPLETED"; value: TResult }>
  | Readonly<{ state: "ROLLED_BACK"; error: unknown }>
  | Readonly<{ state: "UNKNOWN" }>;

export type PlanningAuditTransactionExecutor<TTransaction> = <TResult>(
  callback: (transaction: TTransaction) => Promise<TResult>,
) => Promise<TResult>;

export async function runPlanningAuditTransaction<TTransaction, TResult>(
  execute: PlanningAuditTransactionExecutor<TTransaction>,
  callback: (transaction: TTransaction) => Promise<TResult>,
  verifyAfterUnacknowledgedCompletion: () => Promise<
    PlanningAuditTransactionVerification<TResult>
  >,
): Promise<PlanningAuditTransactionResult<TResult>> {
  let callbackReturned = false;

  try {
    const value = await execute(async (transaction) => {
      const callbackValue = await callback(transaction);
      callbackReturned = true;
      return callbackValue;
    });
    return { state: "COMPLETED", value };
  } catch (error) {
    if (!callbackReturned) return { state: "ROLLED_BACK", error };

    try {
      const verification = await verifyAfterUnacknowledgedCompletion();
      return verification.state === "ROLLED_BACK"
        ? { state: "ROLLED_BACK", error }
        : verification;
    } catch {
      return { state: "UNKNOWN" };
    }
  }
}
