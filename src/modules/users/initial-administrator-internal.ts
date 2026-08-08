import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

import { UserRole, type Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  createAuthentication,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "../authentication/auth";

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
  afterAuthenticationCreate?: () => void | Promise<void>;
}>;

export class InitialAdministratorBootstrapError extends Error {
  readonly code: "INSTALLATION_NOT_EMPTY" | "INCONSISTENT_RESULT";

  constructor(
    code: "INSTALLATION_NOT_EMPTY" | "INCONSISTENT_RESULT",
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

  await dependencies.beforeTransaction?.();

  const storedEmail = await prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(
          ${BOOTSTRAP_ADVISORY_LOCK_NAMESPACE},
          ${BOOTSTRAP_ADVISORY_LOCK_KEY}
        )::text AS "lockResult"
      `;

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

      return verifiedUser.email;
    },
    { timeout: 30_000 },
  );

  return {
    organisationName: metadata.organisationName,
    administratorEmail: storedEmail,
    temporaryCredential,
    temporaryCredentialExpiresAt,
  };
}
