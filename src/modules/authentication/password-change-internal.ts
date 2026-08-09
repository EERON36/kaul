import type { Prisma } from "../../generated/prisma/client";
import { headers } from "next/headers";

import { prisma } from "../../lib/prisma";
import { createAuthentication } from "./auth";
import { getCredentialState } from "./credential-state";
import { AuthenticationGuardError, requireAuthenticatedUser } from "./guards";
import { auditedForcedPasswordChangeInputSchema } from "./password-change-input";
import {
  appendAuditOutcomeInTransaction,
  createPasswordChangedAuditIntent,
  recordFailedAuditOutcome,
} from "../audit/audit";

const PASSWORD_CHANGE_LOCK_NAMESPACE = 1_261_175_076;

export type PasswordChangeTestDependencies = Readonly<{
  currentTime?: () => Date;
  afterAuditIntent?: () => void | Promise<void>;
  afterAuthenticationChange?: () => void | Promise<void>;
  beforeAuditOutcome?: () => void | Promise<void>;
  afterAuditOutcomeBeforeCommit?: () => void | Promise<void>;
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
      role: true,
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
  const validatedInput = auditedForcedPasswordChangeInputSchema.parse(input);
  const requestHeaders = await headers();
  const dependencies = testDependencies ?? {};

  if (user.credentialState === "APPLICATION_ALLOWED") {
    throw new AuthenticationGuardError("FORBIDDEN");
  }

  if (user.credentialState === "TEMPORARY_CREDENTIAL_EXPIRED") {
    throw new AuthenticationGuardError("TEMPORARY_CREDENTIAL_EXPIRED");
  }

  const intent = await createPasswordChangedAuditIntent({
    operationId: validatedInput.operationId,
    actor: user,
  });

  try {
    await dependencies.afterAuditIntent?.();
    return await prisma.$transaction(
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

        if (currentUser.role !== user.role) {
          throw new ForcedPasswordChangeError("INCONSISTENT_RESULT");
        }

        const credentialAccountBefore = await transaction.account.findFirst({
          where: {
            userId: user.userId,
            providerId: "credential",
            password: { not: null },
          },
          select: { id: true, accountId: true, providerId: true },
        });
        const sessionsBefore = await transaction.session.findMany({
          where: { userId: user.userId },
          select: { id: true },
        });
        if (!credentialAccountBefore || sessionsBefore.length === 0) {
          throw new ForcedPasswordChangeError("INCONSISTENT_RESULT");
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

        const verifiedUser = await loadTransactionUser(
          transaction,
          user.userId,
        );
        const credentialAccountAfter = await transaction.account.findFirst({
          where: {
            id: credentialAccountBefore.id,
            userId: user.userId,
            providerId: "credential",
            password: { not: null },
          },
          select: {
            id: true,
            accountId: true,
            providerId: true,
            userId: true,
          },
        });
        const sessionsAfter = await transaction.session.findMany({
          where: { userId: user.userId },
          select: { id: true, userId: true },
        });
        const preChangeSessionIds = sessionsBefore.map(({ id }) => id);

        if (
          !verifiedUser ||
          verifiedUser.id !== user.userId ||
          verifiedUser.organisationId !== user.organisationId ||
          verifiedUser.organisation.id !== user.organisationId ||
          verifiedUser.role !== user.role ||
          verifiedUser.banned !== currentUser.banned ||
          verifiedUser.mustChangePassword !== false ||
          verifiedUser.temporaryCredentialExpiresAt !== null ||
          !credentialAccountAfter ||
          credentialAccountAfter.id !== credentialAccountBefore.id ||
          credentialAccountAfter.accountId !==
            credentialAccountBefore.accountId ||
          credentialAccountAfter.providerId !== "credential" ||
          credentialAccountAfter.userId !== user.userId ||
          sessionsAfter.length === 0 ||
          sessionsAfter.some(
            ({ id, userId }) =>
              userId !== user.userId || preChangeSessionIds.includes(id),
          )
        ) {
          throw new ForcedPasswordChangeError("INCONSISTENT_RESULT");
        }

        const result = {
          setCookieHeaders: getReplacementSetCookieHeaders(
            authenticationResponse,
          ),
        };
        await dependencies.beforeAuditOutcome?.();
        await appendAuditOutcomeInTransaction(transaction, intent, "SUCCEEDED");
        await dependencies.afterAuditOutcomeBeforeCommit?.();

        return result;
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    await recordFailedAuditOutcome(intent);
    throw error;
  }
}
