export type BetterAuthRouteHandler = (request: Request) => Promise<Response>;

const SIGN_IN_FAILURE_BODY = JSON.stringify({
  code: "AUTHENTICATION_FAILED",
});
const SIGN_IN_SERVER_FAILURE_BODY = JSON.stringify({
  code: "AUTHENTICATION_UNAVAILABLE",
});

function isPath(pathname: string, expected: string): boolean {
  return pathname === expected || pathname === `${expected}/`;
}

export function isEmailSignInRequest(request: Request): boolean {
  return (
    request.method === "POST" &&
    isPath(new URL(request.url).pathname, "/api/auth/sign-in/email")
  );
}

export function routeEmailSignInRequest(
  globalHandler: BetterAuthRouteHandler,
  auditedHandler: BetterAuthRouteHandler,
): BetterAuthRouteHandler {
  return (request) =>
    isEmailSignInRequest(request)
      ? auditedHandler(request)
      : globalHandler(request);
}

export function isRawAdminRoute(request: Request): boolean {
  const pathname = new URL(request.url).pathname;

  return (
    pathname === "/api/auth/admin" || pathname.startsWith("/api/auth/admin/")
  );
}

export function isRawChangePasswordRoute(request: Request): boolean {
  return isPath(new URL(request.url).pathname, "/api/auth/change-password");
}

function safeJsonResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function createAuthenticationUnavailableResponse(): Response {
  return safeJsonResponse(SIGN_IN_SERVER_FAILURE_BODY, 500);
}

function normalizeSignInResponse(request: Request, response: Response) {
  if (!isPath(new URL(request.url).pathname, "/api/auth/sign-in/email")) {
    return response;
  }

  if (response.ok || response.status === 429) {
    return response;
  }

  if (response.status >= 400 && response.status < 500) {
    return safeJsonResponse(SIGN_IN_FAILURE_BODY, 401);
  }

  return createAuthenticationUnavailableResponse();
}

export function blockRawAdminRoutes(
  handler: BetterAuthRouteHandler,
): BetterAuthRouteHandler {
  return async (request) => {
    if (isRawAdminRoute(request)) {
      return new Response(null, { status: 404 });
    }

    return handler(request);
  };
}

export function applyBetterAuthRoutePolicy(
  handler: BetterAuthRouteHandler,
): BetterAuthRouteHandler {
  return async (request) => {
    if (isRawAdminRoute(request) || isRawChangePasswordRoute(request)) {
      return new Response(null, { status: 404 });
    }

    return normalizeSignInResponse(request, await handler(request));
  };
}
