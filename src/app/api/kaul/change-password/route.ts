import { ZodError } from "zod";

import { getEnvironment } from "../../../../lib/environment";
import {
  AuthenticationGuardError,
  type AuthenticationGuardErrorCode,
} from "../../../../modules/authentication/guards";
import { changeForcedPassword } from "../../../../modules/authentication/password-change";
import { ForcedPasswordChangeError } from "../../../../modules/authentication/password-change-internal";
import { getPasswordChangeValidationCode } from "../../../../modules/authentication/password-change-input";

const knownGuardCodes = new Set<AuthenticationGuardErrorCode>([
  "UNAUTHENTICATED",
  "ACCOUNT_INACTIVE",
  "PASSWORD_CHANGE_REQUIRED",
  "TEMPORARY_CREDENTIAL_EXPIRED",
  "FORBIDDEN",
]);

function jsonResponse(
  code: string,
  status: number,
  setCookieHeaders: readonly string[] = [],
) {
  const responseHeaders = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });

  for (const setCookieHeader of setCookieHeaders) {
    // Better Auth created this cookie. Kaul forwards it only after the shared
    // password, session, and forced-change transaction has committed.
    responseHeaders.append("set-cookie", setCookieHeader);
  }

  return new Response(JSON.stringify({ code }), {
    status,
    headers: responseHeaders,
  });
}

function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

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
    return jsonResponse("PASSWORD_CHANGE_FAILED", 403);
  }

  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return jsonResponse("INVALID_INPUT", 400);
  }

  try {
    const result = await changeForcedPassword(input);

    return jsonResponse("PASSWORD_CHANGED", 200, result.setCookieHeaders);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonResponse(getPasswordChangeValidationCode(error), 400);
    }

    if (
      error instanceof ForcedPasswordChangeError &&
      error.code === "AUTHENTICATION_FAILED"
    ) {
      return jsonResponse("PASSWORD_CHANGE_FAILED", 400);
    }

    if (
      error instanceof AuthenticationGuardError &&
      knownGuardCodes.has(error.code)
    ) {
      if (error.code === "TEMPORARY_CREDENTIAL_EXPIRED") {
        return jsonResponse("TEMPORARY_CREDENTIAL_EXPIRED", 409);
      }

      return jsonResponse("PASSWORD_CHANGE_FAILED", 401);
    }

    throw error;
  }
}
