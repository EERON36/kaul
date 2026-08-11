import "server-only";

import { handleAuditedEmailSignInInternal } from "./login-audit-internal";

export function handleAuditedEmailSignIn(request: Request): Promise<Response> {
  return handleAuditedEmailSignInInternal(request);
}
