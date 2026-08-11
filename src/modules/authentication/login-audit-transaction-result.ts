export type LoginAuditTransactionState =
  "CALLBACK_FAILED" | "COMPLETED" | "UNKNOWN";

export function classifyLoginAuditTransactionResult(
  state: LoginAuditTransactionState,
): "FAILED" | "SUCCEEDED" | "AMBIGUOUS" {
  if (state === "CALLBACK_FAILED") return "FAILED";
  if (state === "COMPLETED") return "SUCCEEDED";
  return "AMBIGUOUS";
}

export type LoginAuditTransactionResult<TResult> =
  | Readonly<{ state: "CALLBACK_FAILED" }>
  | Readonly<{ state: "COMPLETED"; value: TResult }>
  | Readonly<{ state: "UNKNOWN" }>;

export type LoginAuditTransactionExecutor<TTransaction> = <TResult>(
  callback: (transaction: TTransaction) => Promise<TResult>,
) => Promise<TResult>;

export async function runLoginAuditTransaction<TTransaction, TResult>(
  execute: LoginAuditTransactionExecutor<TTransaction>,
  callback: (transaction: TTransaction) => Promise<TResult>,
): Promise<LoginAuditTransactionResult<TResult>> {
  let callbackReturned = false;

  try {
    const value = await execute(async (transaction) => {
      const callbackValue = await callback(transaction);
      callbackReturned = true;
      return callbackValue;
    });

    return { state: "COMPLETED", value };
  } catch {
    return callbackReturned
      ? { state: "UNKNOWN" }
      : { state: "CALLBACK_FAILED" };
  }
}
