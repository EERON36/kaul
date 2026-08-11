import {
  createLogoutAuthentication,
  logoutCurrentSessionInternal,
  type LogoutResult,
  type LogoutTestDependencies,
} from "./logout-internal";

export function createLogoutAuthenticationForTest(
  databaseClient: Parameters<typeof createLogoutAuthentication>[0],
) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Logout test support requires NODE_ENV=test.");
  }

  return createLogoutAuthentication(databaseClient);
}

export function logoutCurrentSessionForTest(
  headers: Headers,
  dependencies: LogoutTestDependencies,
): Promise<LogoutResult> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Logout test support requires NODE_ENV=test.");
  }

  return logoutCurrentSessionInternal(headers, dependencies);
}
