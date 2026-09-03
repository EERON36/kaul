export type MonthlyReportSigningTransactionVerification<TResult> =
  | Readonly<{ state: "COMPLETED"; value: TResult }>
  | Readonly<{ state: "ROLLED_BACK" }>
  | Readonly<{ state: "UNKNOWN" }>;

export type MonthlyReportSigningTransactionResult<TResult> =
  | Readonly<{ state: "COMPLETED"; value: TResult }>
  | Readonly<{ state: "ROLLED_BACK"; error: unknown }>
  | Readonly<{ state: "UNKNOWN" }>;

export type MonthlyReportSigningTransactionExecutor<TTransaction> = <TResult>(
  callback: (transaction: TTransaction) => Promise<TResult>,
) => Promise<TResult>;

export async function runMonthlyReportSigningTransaction<TTransaction, TResult>(
  execute: MonthlyReportSigningTransactionExecutor<TTransaction>,
  callback: (transaction: TTransaction) => Promise<TResult>,
  verifyAfterUnacknowledgedCompletion: () => Promise<
    MonthlyReportSigningTransactionVerification<TResult>
  >,
): Promise<MonthlyReportSigningTransactionResult<TResult>> {
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
