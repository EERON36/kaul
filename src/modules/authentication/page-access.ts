import type { AuthenticationGuardErrorCode, CredentialState } from "./guards";

export type AuthenticationDestination = "/" | "/byt-losenord";

export function getAuthenticatedDestination(
  state: CredentialState,
): AuthenticationDestination {
  return state === "APPLICATION_ALLOWED" ? "/" : "/byt-losenord";
}

export function getApplicationErrorRedirect(
  code: AuthenticationGuardErrorCode,
): "/login" | "/byt-losenord" | undefined {
  if (code === "UNAUTHENTICATED" || code === "ACCOUNT_INACTIVE") {
    return "/login";
  }

  if (
    code === "PASSWORD_CHANGE_REQUIRED" ||
    code === "TEMPORARY_CREDENTIAL_EXPIRED"
  ) {
    return "/byt-losenord";
  }

  return undefined;
}

export function isLoginPageVisibleError(
  code: AuthenticationGuardErrorCode,
): boolean {
  return code === "UNAUTHENTICATED" || code === "ACCOUNT_INACTIVE";
}

export function getPasswordChangeErrorRedirect(
  code: AuthenticationGuardErrorCode,
): "/login" | undefined {
  return code === "UNAUTHENTICATED" || code === "ACCOUNT_INACTIVE"
    ? "/login"
    : undefined;
}
