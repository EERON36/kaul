import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "../../../../modules/authentication/auth";
import { applyBetterAuthRoutePolicy } from "../../../../modules/authentication/route-policy";

const handlers = toNextJsHandler(auth);

export const GET = applyBetterAuthRoutePolicy(handlers.GET);
export const POST = applyBetterAuthRoutePolicy(handlers.POST);
