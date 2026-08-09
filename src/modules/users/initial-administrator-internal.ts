import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

import { UserRole, type Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  createAuthentication,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "../authentication/auth";
import {
  appendAuditOutcomeInTransaction,
  createSystemAuditIntent,
  generateAuditOperationId,
  recordFailedAuditOutcome,
  recordAmbiguousAuditOutcome,
  recordReviewedInitialAdminFailureInTransaction,
  requireOldestUnresolvedInitialAdminOperation,
} from "../audit/audit";
import { auditOperationIdSchema } from "../audit/audit-vocabulary";

const TEMPORARY_CREDENTIAL_LIFETIME_MS = 24 * 60 * 60 * 1_000;
// The two signed 32-bit keys form a Kaul-specific PostgreSQL lock namespace.
const BOOTSTRAP_ADVISORY_LOCK_NAMESPACE = 1_261_175_076;
const BOOTSTRAP_ADVISORY_LOCK_KEY = 1;

export const initialAdministratorInputSchema = z
  .object({
    organisationName: z.string().trim().min(1).max(200),
    administratorName: z.string().trim().min(1).max(200),
    administratorEmail: z.string().trim().max(254).pipe(z.email()),
    professionalTitle: z.string().trim().min(1).max(120),
  })
  .strict();

export type InitialAdministratorInput = z.infer<
  typeof initialAdministratorInputSchema
>;

export type InitialAdministratorBootstrapResult = Readonly<{
  organisationName: string;
  administratorEmail: string;
  temporaryCredential: string;
  temporaryCredentialExpiresAt: Date;
}>;

export type InitialAdministratorTestDependencies = Readonly<{
  currentTime?: () => Date;
  generateCredential?: () => string;
  beforeTransaction?: () => void | Promise<void>;
  afterAuditIntent?: (operationId: string) => void | Promise<void>;
  afterAuthenticationCreate?: () => void | Promise<void>;
}>;

export class InitialAdministratorBootstrapError extends Error {
  readonly code:
    | "INSTALLATION_NOT_EMPTY"
    | "INCONSISTENT_RESULT"
    | "OPERATION_REQUIRES_REVIEW";

  constructor(
    code:
      | "INSTALLATION_NOT_EMPTY"
      | "INCONSISTENT_RESULT"
      | "OPERATION_REQUIRES_REVIEW",
    message: string,
  ) {
    super(message);
    Object.defineProperty(this, "name", {
      value: "InitialAdministratorBootstrapError",
      configurable: true,
    });
    this.code = code;
  }
}

export function generateTemporaryCredentialInternal(): string {
  const credential = randomBytes(32).toString("base64url");

  if (
    credential.length < MIN_PASSWORD_LENGTH ||
    credential.length > MAX_PASSWORD_LENGTH
  ) {
    throw new Error("Generated credential does not meet the password policy.");
  }

  return credential;
}

function assertGeneratedCredential(credential: string): void {
  if (
    credential.length < MIN_PASSWORD_LENGTH ||
    credential.length > MAX_PASSWORD_LENGTH
  ) {
    throw new Error("Generated credential does not meet the password policy.");
  }
}

async function assertInstallationIsEmpty(
  database: Pick<Prisma.TransactionClient, "organisation" | "user">,
): Promise<void> {
  const organisationCount = await database.organisation.count();
  const userCount = await database.user.count();

  if (organisationCount !== 0 || userCount !== 0) {
    throw new InitialAdministratorBootstrapError(
      "INSTALLATION_NOT_EMPTY",
      "Initial Administrator bootstrap requires an empty installation.",
    );
  }
}

export async function bootstrapInitialAdministratorInternal(
  input: InitialAdministratorInput,
  testDependencies?: InitialAdministratorTestDependencies,
): Promise<InitialAdministratorBootstrapResult> {
  if (testDependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error(
      "Initial Administrator dependencies are available only in tests.",
    );
  }

  const dependencies = testDependencies ?? {};
  const metadata = initialAdministratorInputSchema.parse(input);

  await assertInstallationIsEmpty(prisma);

  const creationTime = dependencies.currentTime?.() ?? new Date();
  const temporaryCredential =
    dependencies.generateCredential?.() ??
    generateTemporaryCredentialInternal();
  assertGeneratedCredential(temporaryCredential);

  const temporaryCredentialExpiresAt = new Date(
    creationTime.getTime() + TEMPORARY_CREDENTIAL_LIFETIME_MS,
  );
  const organisationId = randomUUID();
  const operationId = generateAuditOperationId();
  const intent = await createSystemAuditIntent({
    operationId,
    organisationId,
    action: "INITIAL_ADMIN_CREATED",
    target: { targetId: organisationId },
  });
  await dependencies.afterAuditIntent?.(operationId);

  await dependencies.beforeTransaction?.();

  let storedEmail: string;
  let transactionCallbackCompleted = false;
  try {
    storedEmail = await prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(
          ${BOOTSTRAP_ADVISORY_LOCK_NAMESPACE},
          ${BOOTSTRAP_ADVISORY_LOCK_KEY}
        )::text AS "lockResult"
      `;

        try {
          await requireOldestUnresolvedInitialAdminOperation(
            transaction,
            operationId,
          );
        } catch {
          throw new InitialAdministratorBootstrapError(
            "OPERATION_REQUIRES_REVIEW",
            "An earlier Initial Administrator operation requires review.",
          );
        }

        await assertInstallationIsEmpty(transaction);

        const organisation = await transaction.organisation.create({
          data: {
            id: organisationId,
            name: metadata.organisationName,
          },
          select: { id: true },
        });
        const transactionAuthentication = createAuthentication(transaction);
        const created = await transactionAuthentication.api.createUser({
          body: {
            name: metadata.administratorName,
            email: metadata.administratorEmail,
            password: temporaryCredential,
            role: UserRole.ADMINISTRATOR,
            data: {
              organisationId,
              professionalTitle: metadata.professionalTitle,
              mustChangePassword: true,
              temporaryCredentialExpiresAt,
            },
          },
        });

        await dependencies.afterAuthenticationCreate?.();

        const verifiedOrganisation = await transaction.organisation.findUnique({
          where: { id: organisation.id },
          select: { id: true, name: true },
        });
        const verifiedUser = await transaction.user.findUnique({
          where: { id: created.user.id },
          select: {
            name: true,
            email: true,
            banned: true,
            organisationId: true,
            professionalTitle: true,
            role: true,
            mustChangePassword: true,
            temporaryCredentialExpiresAt: true,
          },
        });
        const credentialAccountCount = await transaction.account.count({
          where: {
            userId: created.user.id,
            providerId: "credential",
            password: { not: null },
          },
        });
        const organisationCount = await transaction.organisation.count();
        const userCount = await transaction.user.count();
        const accountCount = await transaction.account.count();

        const isExpectedResult =
          organisationCount === 1 &&
          userCount === 1 &&
          accountCount === 1 &&
          verifiedOrganisation?.name === metadata.organisationName &&
          verifiedUser?.name === metadata.administratorName &&
          verifiedUser.banned !== true &&
          verifiedUser?.organisationId === organisation.id &&
          verifiedUser.professionalTitle === metadata.professionalTitle &&
          verifiedUser.role === UserRole.ADMINISTRATOR &&
          verifiedUser.mustChangePassword === true &&
          verifiedUser.temporaryCredentialExpiresAt?.getTime() ===
            temporaryCredentialExpiresAt.getTime() &&
          credentialAccountCount === 1;

        if (!isExpectedResult) {
          throw new InitialAdministratorBootstrapError(
            "INCONSISTENT_RESULT",
            "Initial Administrator bootstrap verification failed.",
          );
        }

        await appendAuditOutcomeInTransaction(transaction, intent, "SUCCEEDED");
        transactionCallbackCompleted = true;

        return verifiedUser.email;
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    try {
      if (transactionCallbackCompleted) {
        await recordAmbiguousAuditOutcome(intent);
      } else {
        await recordFailedAuditOutcome(intent);
      }
    } catch {
      throw new InitialAdministratorBootstrapError(
        "OPERATION_REQUIRES_REVIEW",
        "Initial Administrator audit outcome requires review.",
      );
    }
    throw error;
  }

  return {
    organisationName: metadata.organisationName,
    administratorEmail: storedEmail,
    temporaryCredential,
    temporaryCredentialExpiresAt,
  };
}

export async function recoverInitialAdministratorBootstrapInternal(
  operationId: string,
): Promise<void> {
  const parsedOperationId = auditOperationIdSchema.safeParse(operationId);
  if (!parsedOperationId.success) {
    throw new InitialAdministratorBootstrapError(
      "OPERATION_REQUIRES_REVIEW",
      "The bootstrap operation identifier is invalid.",
    );
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(
        ${BOOTSTRAP_ADVISORY_LOCK_NAMESPACE},
        ${BOOTSTRAP_ADVISORY_LOCK_KEY}
      )::text AS "lockResult"
    `;

    const operation = await transaction.auditOperation.findUnique({
      where: { id: parsedOperationId.data },
      select: { targetId: true },
    });
    const [organisationCount, userCount, accountCount, plannedTargetCount] =
      await Promise.all([
        transaction.organisation.count(),
        transaction.user.count(),
        transaction.account.count(),
        operation?.targetId
          ? transaction.organisation.count({
              where: { id: operation.targetId },
            })
          : Promise.resolve(1),
      ]);

    if (
      organisationCount !== 0 ||
      userCount !== 0 ||
      accountCount !== 0 ||
      plannedTargetCount !== 0
    ) {
      throw new InitialAdministratorBootstrapError(
        "OPERATION_REQUIRES_REVIEW",
        "The installation cannot be proven empty.",
      );
    }

    await recordReviewedInitialAdminFailureInTransaction(
      transaction,
      parsedOperationId.data,
    );
  });
}
