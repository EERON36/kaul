import type { PasswordChangeValidationCode } from "./password-change-input";

export type PasswordChangeResponseCode =
  | PasswordChangeValidationCode
  | "PASSWORD_CHANGE_FAILED"
  | "TEMPORARY_CREDENTIAL_EXPIRED";

const messages: Record<PasswordChangeResponseCode, string> = {
  CURRENT_PASSWORD_REQUIRED: "Ange ditt nuvarande lösenord.",
  NEW_PASSWORD_TOO_SHORT: "Det nya lösenordet måste innehålla minst 15 tecken.",
  NEW_PASSWORD_TOO_LONG: "Det nya lösenordet får innehålla högst 128 tecken.",
  PASSWORDS_DO_NOT_MATCH: "De nya lösenorden stämmer inte överens.",
  INVALID_INPUT: "Kontrollera uppgifterna och försök igen.",
  PASSWORD_CHANGE_FAILED:
    "Lösenordet kunde inte ändras. Kontrollera uppgifterna och försök igen.",
  TEMPORARY_CREDENTIAL_EXPIRED:
    "Den tillfälliga inloggningsuppgiften kan inte längre användas. Kontakta administratören.",
};

export function getPasswordChangeFeedback(code: unknown): string {
  if (typeof code === "string" && code in messages) {
    return messages[code as PasswordChangeResponseCode];
  }

  return messages.PASSWORD_CHANGE_FAILED;
}
