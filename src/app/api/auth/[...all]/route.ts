import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "../../../../modules/authentication/auth";
import { blockRawAdminRoutes } from "../../../../modules/authentication/route-policy";

const handlers = toNextJsHandler(auth);

export const GET = blockRawAdminRoutes(handlers.GET);
export const POST = blockRawAdminRoutes(handlers.POST);
