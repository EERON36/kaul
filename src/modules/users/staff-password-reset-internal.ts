import "server-only";

import { randomBytes } from "node:crypto";

import { UserRole, type Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  appendAuditOutcomeInTransaction,
  AuditError,
  createUserAuditIntent,
  recordAmbiguousAuditOutcome,
  recordFailedAuditOutcome,
  type AuditIntentHandle,
} from "../audit/audit";
import {
  createAuthentication,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "../authentication/auth";
import type { AdministratorUser } from "./authorization";
import {
  staffPasswordResetInputSchema,
  type StaffPasswordResetInput,
} from "./staff-management-input";
import { StaffManagementError } from "./staff-management-internal";

const TEMPORARY_CREDENTIAL_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const USER_MUTATION_LOCK_NAMESPACE = 1_261_175_076;

export type StaffPasswordResetResult = Readonly<{
  temporaryCredential: string;
  temporaryCredentialExpiresAt: Date;
}>;

export type StaffPasswordResetTestDependencies = Readonly<{
  currentTime?: () => Date;
  generateCredential?: () => string;
  afterAuditIntent?: () => void | Promise<void>;
  afterPasswordMutation?: () => void | Promise<void>;
  afterSessionRevocation?: () => void | Promise<void>;
  afterStateUpdate?: () => void | Promise<void>;
}>;

class DefinitivePasswordResetError extends Error {
  readonly code?: "TARGET_UNAVAILABLE" | "RESET_ALREADY_PENDING";

  constructor(code?: "TARGET_UNAVAILABLE" | "RESET_ALREADY_PENDING") {
    super("Staff password reset failed.");
    this.code = code;
  }
}

function getTestDependencies(
  dependencies?: StaffPasswordResetTestDependencies,
): StaffPasswordResetTestDependencies {
  if (dependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error(
      "Staff password reset dependencies are available only in tests.",
    );
  }

  return dependencies ?? {};
}

function generateTemporaryCredential(
  dependencies: StaffPasswordResetTestDependencies,
): string {
  const credential =
    dependencies.generateCredential?.() ??
    randomBytes(32).toString("base64url");

  if (
    credential.length < MIN_PASSWORD_LENGTH ||
    credential.length > MAX_PASSWORD_LENGTH
  ) {
    throw new DefinitivePasswordResetError();
  }

  return credential;
}

async function assertEligibleTarget(
  targetUserId: string,
  actor: AdministratorUser,
  database: Pick<Prisma.TransactionClient, "user"> = prisma,
): Promise<void> {
  const target = await database.user.findUnique({
    where: { id: targetUserId },
    select: { organisationId: true, role: true, banned: true },
  });

  if (
    !target ||
    targetUserId === actor.userId ||
    target.organisationId !== actor.organisationId ||
    target.role !== UserRole.STAFF_MEMBER ||
    target.banned === true
  ) {
    throw new StaffManagementError("TARGET_UNAVAILABLE");
  }
}

async function assertCurrentAdministrator(
  transaction: Pick<Prisma.TransactionClient, "user">,
  actor: AdministratorUser,
): Promise<void> {
  const currentActor = await transaction.user.findUnique({
    where: { id: actor.userId },
    select: { organisationId: true, role: true, banned: true },
  });

  if (
    !currentActor ||
    currentActor.organisationId !== actor.organisationId ||
    currentActor.role !== UserRole.ADMINISTRATOR ||
    currentActor.banned === true
  ) {
    throw new DefinitivePasswordResetError();
  }
}

async function finishFailedReset(
  intent: AuditIntentHandle,
  error: unknown,
  targetUserId: string,
): Promise<never> {
  await recordFailedAuditOutcome(intent, targetUserId);

  if (error instanceof AuditError) {
    throw error;
  }

  if (error instanceof DefinitivePasswordResetError && error.code) {
    throw new StaffManagementError(error.code);
  }

  throw new StaffManagementError("INCONSISTENT_RESULT");
}

async function finishAmbiguousReset(
  intent: AuditIntentHandle,
  targetUserId: string,
): Promise<never> {
  await recordAmbiguousAuditOutcome(intent, targetUserId);
  throw new StaffManagementError("OPERATION_AMBIGUOUS");
}

export async function resetStaffPasswordInternal(
  input: StaffPasswordResetInput,
  actor: AdministratorUser,
  requestHeaders: Headers,
  testDependencies?: StaffPasswordResetTestDependencies,
): Promise<StaffPasswordResetResult> {
  const parsed = staffPasswordResetInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  await assertEligibleTarget(parsed.targetUserId, actor);

  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor,
    action: "PASSWORD_RESET_BY_ADMIN",
    target: { targetId: parsed.targetUserId },
  });

  let transactionCallbackCompleted = false;

  try {
    await dependencies.afterAuditIntent?.();
    const result = await prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(
            ${USER_MUTATION_LOCK_NAMESPACE},
            hashtext(${parsed.targetUserId})
          )::text AS "lockResult"
        `;
        await assertCurrentAdministrator(transaction, actor);

        try {
          await assertEligibleTarget(parsed.targetUserId, actor, transaction);
        } catch (error) {
          if (
            error instanceof StaffManagementError &&
            error.code === "TARGET_UNAVAILABLE"
          ) {
            throw new DefinitivePasswordResetError("TARGET_UNAVAILABLE");
          }
          throw error;
        }

        const before = await transaction.user.findUniqueOrThrow({
          where: { id: parsed.targetUserId },
          select: {
            name: true,
            email: true,
            organisationId: true,
            professionalTitle: true,
            role: true,
            banned: true,
            banReason: true,
            banExpires: true,
            mustChangePassword: true,
            temporaryCredentialExpiresAt: true,
          },
        });
        const resetTime = dependencies.currentTime?.() ?? new Date();
        const credentialAccountCountBefore = await transaction.account.count({
          where: {
            userId: parsed.targetUserId,
            providerId: "credential",
            password: { not: null },
          },
        });

        if (credentialAccountCountBefore !== 1) {
          throw new DefinitivePasswordResetError();
        }

        if (
          before.mustChangePassword === true &&
          before.temporaryCredentialExpiresAt !== null &&
          before.temporaryCredentialExpiresAt.getTime() > resetTime.getTime()
        ) {
          throw new DefinitivePasswordResetError("RESET_ALREADY_PENDING");
        }

        const temporaryCredential = generateTemporaryCredential(dependencies);
        const temporaryCredentialExpiresAt = new Date(
          resetTime.getTime() + TEMPORARY_CREDENTIAL_LIFETIME_MS,
        );
        const transactionAuthentication = createAuthentication(transaction);

        try {
          await transactionAuthentication.api.setUserPassword({
            headers: requestHeaders,
            body: {
              userId: parsed.targetUserId,
              newPassword: temporaryCredential,
            },
          });
        } catch {
          throw new DefinitivePasswordResetError();
        }
        await dependencies.afterPasswordMutation?.();

        const update = await transaction.user.updateMany({
          where: {
            id: parsed.targetUserId,
            organisationId: actor.organisationId,
            role: UserRole.STAFF_MEMBER,
            OR: [{ banned: false }, { banned: null }],
          },
          data: {
            mustChangePassword: true,
            temporaryCredentialExpiresAt,
          },
        });
        if (update.count !== 1) {
          throw new DefinitivePasswordResetError();
        }
        await dependencies.afterStateUpdate?.();

        try {
          await transactionAuthentication.api.revokeUserSessions({
            headers: requestHeaders,
            body: { userId: parsed.targetUserId },
          });
        } catch {
          throw new DefinitivePasswordResetError();
        }
        await dependencies.afterSessionRevocation?.();

        const after = await transaction.user.findUnique({
          where: { id: parsed.targetUserId },
          select: {
            name: true,
            email: true,
            organisationId: true,
            professionalTitle: true,
            role: true,
            banned: true,
            banReason: true,
            banExpires: true,
            mustChangePassword: true,
            temporaryCredentialExpiresAt: true,
          },
        });
        const credentialAccountCount = await transaction.account.count({
          where: {
            userId: parsed.targetUserId,
            providerId: "credential",
            password: { not: null },
          },
        });
        const sessionCount = await transaction.session.count({
          where: { userId: parsed.targetUserId },
        });

        if (
          !after ||
          after.name !== before.name ||
          after.email !== before.email ||
          after.organisationId !== before.organisationId ||
          after.professionalTitle !== before.professionalTitle ||
          after.role !== before.role ||
          after.banned !== before.banned ||
          after.banReason !== before.banReason ||
          after.banExpires?.getTime() !== before.banExpires?.getTime() ||
          after.mustChangePassword !== true ||
          after.temporaryCredentialExpiresAt?.getTime() !==
            temporaryCredentialExpiresAt.getTime() ||
          credentialAccountCount !== 1 ||
          sessionCount !== 0
        ) {
          throw new DefinitivePasswordResetError();
        }

        await appendAuditOutcomeInTransaction(
          transaction,
          intent,
          "SUCCEEDED",
          parsed.targetUserId,
        );
        transactionCallbackCompleted = true;

        return { temporaryCredential, temporaryCredentialExpiresAt };
      },
      { timeout: 30_000 },
    );

    return result;
  } catch (error) {
    if (transactionCallbackCompleted) {
      return finishAmbiguousReset(intent, parsed.targetUserId);
    }

    return finishFailedReset(intent, error, parsed.targetUserId);
  }
}
