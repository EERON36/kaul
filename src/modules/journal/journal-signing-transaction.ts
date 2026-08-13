export type JournalSigningTransactionVerification<TResult> =
  | Readonly<{ state: "COMPLETED"; value: TResult }>
  | Readonly<{ state: "ROLLED_BACK" }>
  | Readonly<{ state: "UNKNOWN" }>;

export type JournalSigningTransactionResult<TResult> =
  | Readonly<{ state: "COMPLETED"; value: TResult }>
  | Readonly<{ state: "ROLLED_BACK"; error: unknown }>
  | Readonly<{ state: "UNKNOWN" }>;

export type JournalSigningTransactionExecutor<TTransaction> = <TResult>(
  callback: (transaction: TTransaction) => Promise<TResult>,
) => Promise<TResult>;

export async function runJournalSigningTransaction<TTransaction, TResult>(
  execute: JournalSigningTransactionExecutor<TTransaction>,
  callback: (transaction: TTransaction) => Promise<TResult>,
  verifyAfterUnacknowledgedCompletion: () => Promise<
    JournalSigningTransactionVerification<TResult>
  >,
): Promise<JournalSigningTransactionResult<TResult>> {
  let callbackReturned = false;

  try {
    const value = await execute(async (transaction) => {
      const callbackValue = await callback(transaction);
      callbackReturned = true;
      return callbackValue;
    });

    return { state: "COMPLETED", value };
  } catch (error) {
    if (!callbackReturned) {
      return { state: "ROLLED_BACK", error };
    }

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
