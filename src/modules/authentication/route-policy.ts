export type BetterAuthRouteHandler = (request: Request) => Promise<Response>;

export function isRawAdminRoute(request: Request): boolean {
  const pathname = new URL(request.url).pathname;

  return (
    pathname === "/api/auth/admin" || pathname.startsWith("/api/auth/admin/")
  );
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
