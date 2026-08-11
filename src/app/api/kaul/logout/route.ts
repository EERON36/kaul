import { getEnvironment } from "../../../../lib/environment";
import { logoutCurrentSession } from "../../../../modules/authentication/logout";

function jsonResponse(
  code: string,
  status: number,
  setCookieHeaders: readonly string[] = [],
): Response {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });

  for (const setCookieHeader of setCookieHeaders) {
    headers.append("set-cookie", setCookieHeader);
  }

  return new Response(JSON.stringify({ code }), { status, headers });
}

function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return (
      new URL(origin).origin ===
      new URL(getEnvironment().BETTER_AUTH_URL).origin
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedOrigin(request)) {
    return jsonResponse("LOGOUT_FAILED", 403);
  }

  const result = await logoutCurrentSession(request.headers);
  return jsonResponse("LOGGED_OUT", 200, result.setCookieHeaders);
}
