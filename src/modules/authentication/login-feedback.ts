export const GENERIC_LOGIN_FAILURE_MESSAGE =
  "Det gick inte att logga in. Kontrollera uppgifterna och försök igen. Om en tillfällig inloggningsuppgift inte längre fungerar, kontakta administratören.";

export function getLoginFailureMessage(): string {
  return GENERIC_LOGIN_FAILURE_MESSAGE;
}
