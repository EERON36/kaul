import type { Prisma } from "../../generated/prisma/client";
import { headers } from "next/headers";

import { prisma } from "../../lib/prisma";
import { createAuthentication } from "./auth";
import { getCredentialState } from "./credential-state";
import { AuthenticationGuardError, requireAuthenticatedUser } from "./guards";
import { forcedPasswordChangeInputSchema } from "./password-change-input";

const PASSWORD_CHANGE_LOCK_NAMESPACE = 1_261_175_076;

export type PasswordChangeTestDependencies = Readonly<{
  currentTime?: () => Date;
  afterAuthenticationChange?: () => void | Promise<void>;
}>;

export type ForcedPasswordChangeResult = Readonly<{
  setCookieHeaders: readonly string[];
}>;

export class ForcedPasswordChangeError extends Error {
  readonly code: "AUTHENTICATION_FAILED" | "INCONSISTENT_RESULT";

  constructor(code: "AUTHENTICATION_FAILED" | "INCONSISTENT_RESULT") {
    super("Password change requirement not satisfied.");
    Object.defineProperty(this, "name", {
      value: "ForcedPasswordChangeError",
      configurable: true,
    });
    this.code = code;
  }
}

export function getReplacementSetCookieHeaders(
  response: Response,
): readonly string[] {
  const setCookieHeaders = response.headers.getSetCookie();

  if (setCookieHeaders.length === 0) {
    throw new ForcedPasswordChangeError("INCONSISTENT_RESULT");
  }

  return setCookieHeaders;
}

async function loadTransactionUser(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  return transaction.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      banned: true,
      organisationId: true,
      mustChangePassword: true,
      temporaryCredentialExpiresAt: true,
      organisation: { select: { id: true } },
    },
  });
}

export async function changeForcedPasswordInternal(
  input: unknown,
  testDependencies?: PasswordChangeTestDependencies,
): Promise<ForcedPasswordChangeResult> {
  if (testDependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error(
      "Password-change dependencies are available only in tests.",
    );
  }

  const user = await requireAuthenticatedUser();
  const validatedInput = forcedPasswordChangeInputSchema.parse(input);
  const requestHeaders = await headers();
  const dependencies = testDependencies ?? {};

  if (user.credentialState === "APPLICATION_ALLOWED") {
    throw new AuthenticationGuardError("FORBIDDEN");
  }

  if (user.credentialState === "TEMPORARY_CREDENTIAL_EXPIRED") {
    throw new AuthenticationGuardError("TEMPORARY_CREDENTIAL_EXPIRED");
  }

  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(
          ${PASSWORD_CHANGE_LOCK_NAMESPACE},
          hashtext(${user.userId})
        )::text AS "lockResult"
      `;

      const currentUser = await loadTransactionUser(transaction, user.userId);

      if (!currentUser) {
        throw new AuthenticationGuardError("UNAUTHENTICATED");
      }

      if (currentUser.banned === true) {
        throw new AuthenticationGuardError("ACCOUNT_INACTIVE");
      }

      if (
        currentUser.organisationId.length === 0 ||
        currentUser.organisation.id !== currentUser.organisationId
      ) {
        throw new AuthenticationGuardError("INCONSISTENT_ORGANISATION");
      }

      const credentialState = getCredentialState(
        currentUser.mustChangePassword,
        currentUser.temporaryCredentialExpiresAt,
        dependencies.currentTime?.() ?? new Date(),
      );

      if (credentialState === "APPLICATION_ALLOWED") {
        throw new AuthenticationGuardError("FORBIDDEN");
      }

      if (credentialState === "TEMPORARY_CREDENTIAL_EXPIRED") {
        throw new AuthenticationGuardError("TEMPORARY_CREDENTIAL_EXPIRED");
      }

      const transactionAuthentication = createAuthentication(transaction);
      const authenticationResponse =
        await transactionAuthentication.api.changePassword({
          headers: requestHeaders,
          body: {
            currentPassword: validatedInput.currentPassword,
            newPassword: validatedInput.newPassword,
            revokeOtherSessions: true,
          },
          asResponse: true,
        });

      if (!authenticationResponse.ok) {
        if (
          authenticationResponse.status >= 400 &&
          authenticationResponse.status < 500
        ) {
          throw new ForcedPasswordChangeError("AUTHENTICATION_FAILED");
        }

        throw new Error("Better Auth password change failed unexpectedly.");
      }

      await dependencies.afterAuthenticationChange?.();

      const update = await transaction.user.updateMany({
        where: {
          id: user.userId,
          mustChangePassword: true,
        },
        data: {
          mustChangePassword: false,
          temporaryCredentialExpiresAt: null,
        },
      });

      if (update.count !== 1) {
        throw new ForcedPasswordChangeError("INCONSISTENT_RESULT");
      }

      return {
        setCookieHeaders: getReplacementSetCookieHeaders(
          authenticationResponse,
        ),
      };
    },
    { timeout: 30_000 },
  );
}
