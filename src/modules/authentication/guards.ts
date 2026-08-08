import "server-only";

import { headers } from "next/headers";

import { prisma } from "../../lib/prisma";
import { auth } from "./auth";
import { getCredentialState } from "./credential-state";
import type { UserRole } from "./permissions";

export const AUTHENTICATION_GUARD_ERROR_MESSAGE =
  "Authentication requirement not satisfied.";

export type AuthenticationGuardErrorCode =
  | "UNAUTHENTICATED"
  | "ACCOUNT_INACTIVE"
  | "PASSWORD_CHANGE_REQUIRED"
  | "TEMPORARY_CREDENTIAL_EXPIRED"
  | "FORBIDDEN"
  | "INCONSISTENT_ORGANISATION";

export class AuthenticationGuardError extends Error {
  readonly code: AuthenticationGuardErrorCode;

  constructor(code: AuthenticationGuardErrorCode) {
    super(AUTHENTICATION_GUARD_ERROR_MESSAGE);
    Object.defineProperty(this, "name", {
      value: "AuthenticationGuardError",
      configurable: true,
    });
    this.code = code;
  }
}

export type { CredentialState } from "./credential-state";

type AuthenticatedUserBase = Readonly<{
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  organisationId: string;
  organisationName: string;
  professionalTitle: string;
}>;

export type ApplicationUser = AuthenticatedUserBase &
  Readonly<{
    mustChangePassword: false;
    credentialState: "APPLICATION_ALLOWED";
  }>;

type PasswordChangeRequiredUser = AuthenticatedUserBase &
  Readonly<{
    mustChangePassword: true;
    credentialState: "PASSWORD_CHANGE_REQUIRED";
  }>;

type TemporaryCredentialExpiredUser = AuthenticatedUserBase &
  Readonly<{
    mustChangePassword: true;
    credentialState: "TEMPORARY_CREDENTIAL_EXPIRED";
  }>;

export type AuthenticatedUser =
  ApplicationUser | PasswordChangeRequiredUser | TemporaryCredentialExpiredUser;

/**
 * Low-level identity primitive for authentication-specific workflows that must
 * remain available before ordinary application access, such as logout and the
 * future password-change or minimum recovery flows. Business functionality
 * must use requireApplicationUser() instead.
 */
export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });

  if (!session) {
    throw new AuthenticationGuardError("UNAUTHENTICATED");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      organisationId: true,
      professionalTitle: true,
      mustChangePassword: true,
      temporaryCredentialExpiresAt: true,
      organisation: {
        select: { id: true, name: true },
      },
    },
  });

  if (!user) {
    throw new AuthenticationGuardError("UNAUTHENTICATED");
  }

  if (user.banned === true) {
    throw new AuthenticationGuardError("ACCOUNT_INACTIVE");
  }

  if (
    user.organisationId.length === 0 ||
    user.organisation.id !== user.organisationId
  ) {
    throw new AuthenticationGuardError("INCONSISTENT_ORGANISATION");
  }

  const credentialState = getCredentialState(
    user.mustChangePassword,
    user.temporaryCredentialExpiresAt,
    new Date(),
  );
  const base = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organisationId: user.organisationId,
    organisationName: user.organisation.name,
    professionalTitle: user.professionalTitle,
  };

  if (credentialState === "APPLICATION_ALLOWED") {
    return {
      ...base,
      mustChangePassword: false,
      credentialState,
    };
  }

  return {
    ...base,
    mustChangePassword: true,
    credentialState,
  };
}

export async function requireApplicationUser(): Promise<ApplicationUser> {
  const user = await requireAuthenticatedUser();

  if (user.credentialState === "PASSWORD_CHANGE_REQUIRED") {
    throw new AuthenticationGuardError("PASSWORD_CHANGE_REQUIRED");
  }

  if (user.credentialState === "TEMPORARY_CREDENTIAL_EXPIRED") {
    throw new AuthenticationGuardError("TEMPORARY_CREDENTIAL_EXPIRED");
  }

  return user;
}
