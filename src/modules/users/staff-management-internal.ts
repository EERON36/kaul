import "server-only";

import { randomBytes } from "node:crypto";

import { APIError } from "better-auth/api";

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
  createStaffMemberInputSchema,
  staffMemberStatusInputSchema,
  type CreateStaffMemberInput,
  type StaffMemberStatusInput,
} from "./staff-management-input";

const TEMPORARY_CREDENTIAL_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const USER_MUTATION_LOCK_NAMESPACE = 1_261_175_076;

export type StaffMemberListItem = Readonly<{
  id: string;
  name: string;
  email: string;
  professionalTitle: string;
  active: boolean;
}>;

export type CreatedStaffMember = Readonly<{
  id: string;
  name: string;
  email: string;
  temporaryCredential: string;
  temporaryCredentialExpiresAt: Date;
}>;

export type StaffManagementErrorCode =
  | "DUPLICATE_EMAIL"
  | "TARGET_UNAVAILABLE"
  | "INCONSISTENT_RESULT"
  | "OPERATION_AMBIGUOUS";

export class StaffManagementError extends Error {
  readonly code: StaffManagementErrorCode;

  constructor(code: StaffManagementErrorCode) {
    super("Staff management requirement not satisfied.");
    Object.defineProperty(this, "name", {
      value: "StaffManagementError",
      configurable: true,
    });
    this.code = code;
  }
}

export type StaffManagementTestDependencies = Readonly<{
  currentTime?: () => Date;
  generateCredential?: () => string;
  afterAuditIntent?: () => void | Promise<void>;
  afterAuthenticationMutation?: () => void | Promise<void>;
}>;

export function selectStaffMutationFailureOutcome(
  transactionCallbackCompleted: boolean,
): "FAILED" | "AMBIGUOUS" {
  return transactionCallbackCompleted ? "AMBIGUOUS" : "FAILED";
}

type MutationFailureCode = "DUPLICATE_EMAIL" | "TARGET_UNAVAILABLE";

class DefinitiveMutationError extends Error {
  readonly code?: MutationFailureCode;

  constructor(code?: MutationFailureCode) {
    super("Staff mutation failed.");
    this.code = code;
  }
}

function getTestDependencies(
  dependencies?: StaffManagementTestDependencies,
): StaffManagementTestDependencies {
  if (dependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error(
      "Staff management dependencies are available only in tests.",
    );
  }

  return dependencies ?? {};
}

function generateTemporaryCredential(
  dependencies: StaffManagementTestDependencies,
): string {
  const credential =
    dependencies.generateCredential?.() ??
    randomBytes(32).toString("base64url");

  if (
    credential.length < MIN_PASSWORD_LENGTH ||
    credential.length > MAX_PASSWORD_LENGTH
  ) {
    throw new DefinitiveMutationError();
  }

  return credential;
}

function isDuplicateEmailError(error: unknown): boolean {
  return (
    error instanceof APIError &&
    error.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
  );
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
    throw new DefinitiveMutationError();
  }
}

async function lockTargetUser(
  transaction: Prisma.TransactionClient,
  targetUserId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(
      ${USER_MUTATION_LOCK_NAMESPACE},
      hashtext(${targetUserId})
    )::text AS "lockResult"
  `;
}

async function assertAvailableStaffTarget(
  targetUserId: string,
  actor: AdministratorUser,
  expectedActive: boolean,
  database: Pick<Prisma.TransactionClient, "user"> = prisma,
): Promise<void> {
  const target = await database.user.findUnique({
    where: { id: targetUserId },
    select: { organisationId: true, role: true, banned: true },
  });

  const isActive = target?.banned !== true;
  if (
    !target ||
    target.organisationId !== actor.organisationId ||
    target.role !== UserRole.STAFF_MEMBER ||
    isActive !== expectedActive
  ) {
    throw new StaffManagementError("TARGET_UNAVAILABLE");
  }
}

async function finishFailedMutation(
  intent: AuditIntentHandle,
  error: unknown,
  targetUserId?: string,
): Promise<never> {
  await recordFailedAuditOutcome(intent, targetUserId);

  if (error instanceof AuditError) {
    throw error;
  }

  if (error instanceof DefinitiveMutationError && error.code) {
    throw new StaffManagementError(error.code);
  }

  throw new StaffManagementError("INCONSISTENT_RESULT");
}

async function finishAmbiguousMutation(
  intent: AuditIntentHandle,
  targetUserId?: string,
): Promise<never> {
  await recordAmbiguousAuditOutcome(intent, targetUserId);
  throw new StaffManagementError("OPERATION_AMBIGUOUS");
}

export async function listOrganisationStaffInternal(
  actor: AdministratorUser,
): Promise<readonly StaffMemberListItem[]> {
  const users = await prisma.user.findMany({
    where: {
      organisationId: actor.organisationId,
      role: UserRole.STAFF_MEMBER,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      professionalTitle: true,
      banned: true,
    },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    professionalTitle: user.professionalTitle,
    active: user.banned !== true,
  }));
}

export async function createStaffMemberInternal(
  input: CreateStaffMemberInput,
  actor: AdministratorUser,
  requestHeaders: Headers,
  testDependencies?: StaffManagementTestDependencies,
): Promise<CreatedStaffMember> {
  const metadata = createStaffMemberInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  const intent = await createUserAuditIntent({
    operationId: metadata.operationId,
    actor,
    action: "STAFF_ACCOUNT_CREATED",
  });

  let transactionCallbackCompleted = false;
  let createdUserId: string | undefined;

  try {
    await dependencies.afterAuditIntent?.();
    const creationTime = dependencies.currentTime?.() ?? new Date();
    const temporaryCredential = generateTemporaryCredential(dependencies);
    const temporaryCredentialExpiresAt = new Date(
      creationTime.getTime() + TEMPORARY_CREDENTIAL_LIFETIME_MS,
    );

    const created = await prisma.$transaction(async (transaction) => {
      await assertCurrentAdministrator(transaction, actor);
      const transactionAuthentication = createAuthentication(transaction);
      let authenticationResult;

      try {
        authenticationResult = await transactionAuthentication.api.createUser({
          headers: requestHeaders,
          body: {
            name: metadata.name,
            email: metadata.email,
            password: temporaryCredential,
            data: {
              organisationId: actor.organisationId,
              professionalTitle: metadata.professionalTitle,
              mustChangePassword: true,
              temporaryCredentialExpiresAt,
            },
          },
        });
      } catch (error) {
        throw new DefinitiveMutationError(
          isDuplicateEmailError(error) ? "DUPLICATE_EMAIL" : undefined,
        );
      }

      createdUserId = authenticationResult.user.id;
      await dependencies.afterAuthenticationMutation?.();

      const verifiedUser = await transaction.user.findUnique({
        where: { id: createdUserId },
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
        },
      });
      const credentialAccountCount = await transaction.account.count({
        where: {
          userId: createdUserId,
          providerId: "credential",
          password: { not: null },
        },
      });

      if (
        !verifiedUser ||
        verifiedUser.name !== metadata.name ||
        verifiedUser.email !== metadata.email ||
        verifiedUser.role !== UserRole.STAFF_MEMBER ||
        verifiedUser.banned === true ||
        verifiedUser.organisationId !== actor.organisationId ||
        verifiedUser.professionalTitle !== metadata.professionalTitle ||
        verifiedUser.mustChangePassword !== true ||
        verifiedUser.temporaryCredentialExpiresAt?.getTime() !==
          temporaryCredentialExpiresAt.getTime() ||
        credentialAccountCount !== 1
      ) {
        throw new DefinitiveMutationError();
      }

      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        verifiedUser.id,
      );
      transactionCallbackCompleted = true;
      return verifiedUser;
    });

    return {
      id: created.id,
      name: created.name,
      email: created.email,
      temporaryCredential,
      temporaryCredentialExpiresAt,
    };
  } catch (error) {
    if (
      selectStaffMutationFailureOutcome(transactionCallbackCompleted) ===
      "AMBIGUOUS"
    ) {
      return finishAmbiguousMutation(intent, createdUserId);
    }

    return finishFailedMutation(intent, error, createdUserId);
  }
}

async function changeStaffMemberActiveState(
  input: StaffMemberStatusInput,
  actor: AdministratorUser,
  requestHeaders: Headers,
  expectedActive: boolean,
  testDependencies?: StaffManagementTestDependencies,
): Promise<void> {
  const parsed = staffMemberStatusInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  await assertAvailableStaffTarget(parsed.targetUserId, actor, expectedActive);
  const action = expectedActive ? "ACCOUNT_DEACTIVATED" : "ACCOUNT_REACTIVATED";
  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor,
    action,
    target: { targetId: parsed.targetUserId },
  });

  let transactionCallbackCompleted = false;
  try {
    await dependencies.afterAuditIntent?.();
    await prisma.$transaction(async (transaction) => {
      await lockTargetUser(transaction, parsed.targetUserId);
      await assertCurrentAdministrator(transaction, actor);

      try {
        await assertAvailableStaffTarget(
          parsed.targetUserId,
          actor,
          expectedActive,
          transaction,
        );
      } catch (error) {
        if (
          error instanceof StaffManagementError &&
          error.code === "TARGET_UNAVAILABLE"
        ) {
          throw new DefinitiveMutationError("TARGET_UNAVAILABLE");
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
          mustChangePassword: true,
          temporaryCredentialExpiresAt: true,
        },
      });
      const sessionCountBefore = await transaction.session.count({
        where: { userId: parsed.targetUserId },
      });
      const transactionAuthentication = createAuthentication(transaction);

      try {
        if (expectedActive) {
          await transactionAuthentication.api.banUser({
            headers: requestHeaders,
            body: { userId: parsed.targetUserId },
          });
        } else {
          await transactionAuthentication.api.unbanUser({
            headers: requestHeaders,
            body: { userId: parsed.targetUserId },
          });
        }
      } catch {
        throw new DefinitiveMutationError();
      }

      await dependencies.afterAuthenticationMutation?.();
      const after = await transaction.user.findUnique({
        where: { id: parsed.targetUserId },
        select: {
          name: true,
          email: true,
          banned: true,
          banExpires: true,
          organisationId: true,
          professionalTitle: true,
          role: true,
          mustChangePassword: true,
          temporaryCredentialExpiresAt: true,
        },
      });
      const sessionCountAfter = await transaction.session.count({
        where: { userId: parsed.targetUserId },
      });

      const stableFieldsMatch =
        after?.name === before.name &&
        after.email === before.email &&
        after.organisationId === before.organisationId &&
        after.professionalTitle === before.professionalTitle &&
        after.role === before.role &&
        after.mustChangePassword === before.mustChangePassword &&
        after.temporaryCredentialExpiresAt?.getTime() ===
          before.temporaryCredentialExpiresAt?.getTime();
      const stateMatches = expectedActive
        ? after?.banned === true &&
          after.banExpires === null &&
          sessionCountAfter === 0
        : after?.banned !== true && sessionCountAfter === sessionCountBefore;

      if (!stableFieldsMatch || !stateMatches) {
        throw new DefinitiveMutationError();
      }

      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        parsed.targetUserId,
      );
      transactionCallbackCompleted = true;
    });
  } catch (error) {
    if (
      selectStaffMutationFailureOutcome(transactionCallbackCompleted) ===
      "AMBIGUOUS"
    ) {
      return finishAmbiguousMutation(intent, parsed.targetUserId);
    }

    return finishFailedMutation(intent, error, parsed.targetUserId);
  }
}

export function deactivateStaffMemberInternal(
  input: StaffMemberStatusInput,
  actor: AdministratorUser,
  requestHeaders: Headers,
  testDependencies?: StaffManagementTestDependencies,
): Promise<void> {
  return changeStaffMemberActiveState(
    input,
    actor,
    requestHeaders,
    true,
    testDependencies,
  );
}

export function reactivateStaffMemberInternal(
  input: StaffMemberStatusInput,
  actor: AdministratorUser,
  requestHeaders: Headers,
  testDependencies?: StaffManagementTestDependencies,
): Promise<void> {
  return changeStaffMemberActiveState(
    input,
    actor,
    requestHeaders,
    false,
    testDependencies,
  );
}
