export type PasswordChangeTransactionResult =
  "CALLBACK_FAILED" | "COMPLETED" | "UNKNOWN";

export function classifyPasswordChangeTransactionResult(
  result: PasswordChangeTransactionResult,
): "FAILED" | "SUCCEEDED" | "AMBIGUOUS" {
  if (result === "CALLBACK_FAILED") return "FAILED";
  if (result === "COMPLETED") return "SUCCEEDED";
  return "AMBIGUOUS";
}
