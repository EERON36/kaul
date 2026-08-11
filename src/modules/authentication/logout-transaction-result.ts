import { Prisma } from "../../generated/prisma/client";

export type LogoutDeletionTransactionState =
  "CALLBACK_FAILED" | "COMPLETED" | "UNKNOWN";

export type LogoutDeletionTransactionResult =
  | Readonly<{ state: "CALLBACK_FAILED" }>
  | Readonly<{ state: "COMPLETED" }>
  | Readonly<{ state: "UNKNOWN" }>;

export type LogoutDeletionTransactionExecutor<TTransaction> = (
  callback: (transaction: TTransaction) => Promise<void>,
) => Promise<void>;

function isProvenExpiredTransactionRollback(error: unknown): boolean {
  // Prisma 7.9.1 completes the timeout rollback before exposing this
  // structured commit state to the interactive-transaction caller.
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2028"
  ) {
    return false;
  }

  const metadata = error.meta;
  return (
    metadata?.operation === "commit" &&
    typeof metadata.timeout === "number" &&
    typeof metadata.timeTaken === "number"
  );
}

export async function runLogoutDeletionTransaction<TTransaction>(
  execute: LogoutDeletionTransactionExecutor<TTransaction>,
  callback: (transaction: TTransaction) => Promise<void>,
): Promise<LogoutDeletionTransactionResult> {
  let callbackReturned = false;

  try {
    await execute(async (transaction) => {
      await callback(transaction);
      callbackReturned = true;
    });

    return { state: "COMPLETED" };
  } catch (error) {
    if (!callbackReturned || isProvenExpiredTransactionRollback(error)) {
      return { state: "CALLBACK_FAILED" };
    }

    return { state: "UNKNOWN" };
  }
}
