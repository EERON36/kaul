import { z } from "zod";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./auth";

export const forcedPasswordChangeInputSchema = z
  .object({
    currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    confirmPassword: z.string().max(MAX_PASSWORD_LENGTH),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.newPassword !== input.confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "PASSWORDS_DO_NOT_MATCH",
        path: ["confirmPassword"],
      });
    }
  });

export type ForcedPasswordChangeInput = z.infer<
  typeof forcedPasswordChangeInputSchema
>;

export type PasswordChangeValidationCode =
  | "CURRENT_PASSWORD_REQUIRED"
  | "NEW_PASSWORD_TOO_SHORT"
  | "NEW_PASSWORD_TOO_LONG"
  | "PASSWORDS_DO_NOT_MATCH"
  | "INVALID_INPUT";

export function getPasswordChangeValidationCode(
  error: z.ZodError,
): PasswordChangeValidationCode {
  const issue = error.issues[0];

  if (issue?.path[0] === "currentPassword" && issue.code === "too_small") {
    return "CURRENT_PASSWORD_REQUIRED";
  }

  if (issue?.path[0] === "newPassword" && issue.code === "too_small") {
    return "NEW_PASSWORD_TOO_SHORT";
  }

  if (issue?.path[0] === "newPassword" && issue.code === "too_big") {
    return "NEW_PASSWORD_TOO_LONG";
  }

  if (
    issue?.path[0] === "confirmPassword" &&
    issue.message === "PASSWORDS_DO_NOT_MATCH"
  ) {
    return "PASSWORDS_DO_NOT_MATCH";
  }

  return "INVALID_INPUT";
}
