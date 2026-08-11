import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "../../../../modules/authentication/auth";
import { handleAuditedEmailSignIn } from "../../../../modules/authentication/login-audit";
import {
  applyBetterAuthRoutePolicy,
  routeEmailSignInRequest,
} from "../../../../modules/authentication/route-policy";

const handlers = toNextJsHandler(auth);

export const GET = applyBetterAuthRoutePolicy(handlers.GET);
export const POST = applyBetterAuthRoutePolicy(
  routeEmailSignInRequest(handlers.POST, handleAuditedEmailSignIn),
);
