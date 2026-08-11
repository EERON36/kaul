import {
  handleAuditedEmailSignInInternal,
  type LoginAuditTestDependencies,
} from "./login-audit-internal";

export function handleAuditedEmailSignInForTest(
  request: Request,
  dependencies: LoginAuditTestDependencies,
): Promise<Response> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Login-audit test support requires NODE_ENV=test.");
  }

  return handleAuditedEmailSignInInternal(request, dependencies);
}
