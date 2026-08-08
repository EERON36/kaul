export type CredentialState =
  | "APPLICATION_ALLOWED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "TEMPORARY_CREDENTIAL_EXPIRED";

export function getCredentialState(
  mustChangePassword: boolean,
  temporaryCredentialExpiresAt: Date | null,
  currentTime: Date,
): CredentialState {
  if (!mustChangePassword) {
    return "APPLICATION_ALLOWED";
  }

  if (
    temporaryCredentialExpiresAt !== null &&
    temporaryCredentialExpiresAt.getTime() <= currentTime.getTime()
  ) {
    return "TEMPORARY_CREDENTIAL_EXPIRED";
  }

  return "PASSWORD_CHANGE_REQUIRED";
}
