import "server-only";

import { randomUUID } from "node:crypto";

import {
  JournalContentFormat,
  JournalEntryStatus,
  type Prisma,
} from "../../generated/prisma/client";
import type { StructuredSectionValues } from "../../lib/structured-sections";
import { prisma } from "../../lib/prisma";
import {
  appendAuditOutcomeInTransaction,
  AuditError,
  createUserAuditIntent,
  recordAmbiguousAuditOutcome,
  recordFailedAuditOutcome,
  type AuditIntentHandle,
} from "../audit/audit";
import type { AuditAction } from "../audit/audit-vocabulary";
import type { ApplicationUser } from "../authentication/guards";
import {
  getClientDetailAccessWhere,
  getOrdinaryClientAccessWhere,
} from "../clients/client-access";
import { lockClientForMutation } from "../clients/client-mutation-lock";
import {
  beginJournalCorrectionInputSchema,
  clientJournalQueryInputSchema,
  createJournalDraftInputSchema,
  discardJournalDraftInputSchema,
  journalEntryQueryInputSchema,
  saveJournalDraftInputSchema,
  signJournalDraftInputSchema,
  replaceJournalDraftGoalsInputSchema,
  type BeginJournalCorrectionInput,
  type ClientJournalQueryInput,
  type CreateJournalDraftInput,
  type DiscardJournalDraftInput,
  type JournalEntryQueryInput,
  type SaveJournalDraftInput,
  type SignJournalDraftInput,
  type ReplaceJournalDraftGoalsInput,
} from "./journal-input";
import {
  runJournalSigningTransaction,
  type JournalSigningTransactionVerification,
} from "./journal-signing-transaction";

const JOURNAL_ERROR_MESSAGE = "Journal requirement not satisfied.";

export type JournalErrorCode =
  | "TARGET_UNAVAILABLE"
  | "OPEN_DRAFT_CONFLICT"
  | "STALE_VERSION"
  | "SIGNING_CONFLICT"
  | "INCONSISTENT_RESULT"
  | "OPERATION_AMBIGUOUS";

export class JournalError extends Error {
  readonly code: JournalErrorCode;

  constructor(code: JournalErrorCode) {
    super(JOURNAL_ERROR_MESSAGE);
    Object.defineProperty(this, "name", {
      value: "JournalError",
      configurable: true,
    });
    this.code = code;
  }
}

type DefinitiveJournalErrorCode = Exclude<
  JournalErrorCode,
  "INCONSISTENT_RESULT" | "OPERATION_AMBIGUOUS"
>;

class DefinitiveJournalMutationError extends Error {
  readonly code?: DefinitiveJournalErrorCode;

  constructor(code?: DefinitiveJournalErrorCode) {
    super("Journal mutation failed.");
    this.code = code;
  }
}

export type JournalTestDependencies = Readonly<{
  afterDraftGoalMutation?: () => void | Promise<void>;
  beforeSigningTransaction?: () => void | Promise<void>;
  afterSigningMutation?: () => void | Promise<void>;
  afterSigningAuditOutcome?: (
    transaction: Prisma.TransactionClient,
  ) => void | Promise<void>;
}>;

const correctionReferenceSelection = {
  id: true,
  reference: true,
  eventOccurredAt: true,
  signedAt: true,
} satisfies Prisma.JournalEntrySelect;

const journalEntrySelection = {
  id: true,
  reference: true,
  clientId: true,
  status: true,
  entryType: true,
  eventOccurredAt: true,
  content: true,
  contentFormat: true,
  healthContent: true,
  educationOccupationContent: true,
  emotionsBehaviorContent: true,
  socialRelationsContent: true,
  dailyLivingIndependenceContent: true,
  otherContent: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  signedAt: true,
  signerUserId: true,
  signerName: true,
  signerProfessionalTitle: true,
  signerRole: true,
  correctionOfId: true,
  correctionOf: { select: correctionReferenceSelection },
  goalReferences: {
    orderBy: [{ createdAt: "asc" }, { goalId: "asc" }],
    select: {
      goalId: true,
      titleSnapshot: true,
    },
  },
} satisfies Prisma.JournalEntrySelect;

const signedJournalEntryDetailSelection = {
  ...journalEntrySelection,
  corrections: {
    where: { status: JournalEntryStatus.SIGNED },
    orderBy: [{ signedAt: "asc" }, { id: "asc" }],
    select: correctionReferenceSelection,
  },
} satisfies Prisma.JournalEntrySelect;

export type JournalEntryRecord = Readonly<
  Prisma.JournalEntryGetPayload<{ select: typeof journalEntrySelection }>
>;

export type SignedJournalEntryDetail = Readonly<
  Prisma.JournalEntryGetPayload<{
    select: typeof signedJournalEntryDetailSelection;
  }>
>;

type JournalDatabase = Pick<
  Prisma.TransactionClient,
  "user" | "client" | "journalEntry" | "goal" | "journalGoalReference"
>;

export type AvailableJournalGoal = Readonly<{
  id: string;
  title: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
}>;

function getTestDependencies(
  dependencies?: JournalTestDependencies,
): JournalTestDependencies {
  if (dependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error("Journal test dependencies are available only in tests.");
  }
  return dependencies ?? {};
}

function createJournalReference(): string {
  return `JRN-${randomUUID().toUpperCase()}`;
}

function getJournalContentData(value: StructuredSectionValues) {
  return {
    content: "",
    contentFormat: JournalContentFormat.STRUCTURED_V1,
    healthContent: value.healthContent,
    educationOccupationContent: value.educationOccupationContent,
    emotionsBehaviorContent: value.emotionsBehaviorContent,
    socialRelationsContent: value.socialRelationsContent,
    dailyLivingIndependenceContent: value.dailyLivingIndependenceContent,
    otherContent: value.otherContent,
  } as const;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function requireCurrentActor(
  database: JournalDatabase,
  actor: ApplicationUser,
): Promise<ApplicationUser> {
  const current = await database.user.findFirst({
    where: {
      id: actor.userId,
      organisationId: actor.organisationId,
      banned: { not: true },
      mustChangePassword: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organisationId: true,
      professionalTitle: true,
      organisation: { select: { id: true, name: true } },
    },
  });

  if (
    !current ||
    current.organisation.id !== current.organisationId ||
    current.organisationId !== actor.organisationId
  ) {
    throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
  }

  return {
    userId: current.id,
    name: current.name,
    email: current.email,
    role: current.role,
    organisationId: current.organisationId,
    organisationName: current.organisation.name,
    professionalTitle: current.professionalTitle,
    mustChangePassword: false,
    credentialState: "APPLICATION_ALLOWED",
  };
}

async function requireClientForWork(
  database: JournalDatabase,
  actor: ApplicationUser,
  clientId: string,
): Promise<ApplicationUser> {
  const currentActor = await requireCurrentActor(database, actor);
  const client = await database.client.findFirst({
    where: {
      id: clientId,
      ...getOrdinaryClientAccessWhere(currentActor),
    },
    select: { id: true },
  });

  if (!client) {
    throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
  }

  return currentActor;
}

async function requireClientForSignedRead(
  database: JournalDatabase,
  actor: ApplicationUser,
  clientId: string,
): Promise<ApplicationUser> {
  const currentActor = await requireCurrentActor(database, actor);
  const client = await database.client.findFirst({
    where: {
      id: clientId,
      ...getClientDetailAccessWhere(currentActor),
    },
    select: { id: true },
  });

  if (!client) {
    throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
  }

  return currentActor;
}

async function findCurrentDraft(
  database: JournalDatabase,
  actor: ApplicationUser,
  clientId: string,
): Promise<JournalEntryRecord | null> {
  return database.journalEntry.findFirst({
    where: {
      organisationId: actor.organisationId,
      clientId,
      authorUserId: actor.userId,
      status: JournalEntryStatus.DRAFT,
      client: { is: getOrdinaryClientAccessWhere(actor) },
    },
    select: journalEntrySelection,
  });
}

async function findOwnedAccessibleEntry(
  database: JournalDatabase,
  actor: ApplicationUser,
  journalEntryId: string,
) {
  return database.journalEntry.findFirst({
    where: {
      id: journalEntryId,
      organisationId: actor.organisationId,
      authorUserId: actor.userId,
      client: { is: getOrdinaryClientAccessWhere(actor) },
    },
    select: {
      id: true,
      clientId: true,
      status: true,
      version: true,
      correctionOfId: true,
    },
  });
}

async function findOwnedEntryIdentity(
  database: JournalDatabase,
  actor: ApplicationUser,
  journalEntryId: string,
) {
  return database.journalEntry.findFirst({
    where: {
      id: journalEntryId,
      organisationId: actor.organisationId,
      authorUserId: actor.userId,
    },
    select: { clientId: true },
  });
}

function throwPublicJournalError(error: unknown): never {
  if (error instanceof JournalError || error instanceof AuditError) {
    throw error;
  }

  if (error instanceof DefinitiveJournalMutationError && error.code) {
    throw new JournalError(error.code);
  }

  throw new JournalError("INCONSISTENT_RESULT");
}

async function finishFailed(
  intent: AuditIntentHandle,
  error: unknown,
): Promise<never> {
  await recordFailedAuditOutcome(intent);
  return throwPublicJournalError(error);
}

async function finishAmbiguous(intent: AuditIntentHandle): Promise<never> {
  await recordAmbiguousAuditOutcome(intent);
  throw new JournalError("OPERATION_AMBIGUOUS");
}

async function verifySigningTransactionCompletion(
  intent: AuditIntentHandle,
  actor: ApplicationUser,
  clientId: string,
  journalEntryId: string,
  expectedVersion: number,
): Promise<JournalSigningTransactionVerification<JournalEntryRecord>> {
  return prisma.$transaction(async (transaction) => {
    await lockClientForMutation(transaction, clientId);

    const entry = await transaction.journalEntry.findFirst({
      where: {
        id: journalEntryId,
        organisationId: actor.organisationId,
        clientId,
        authorUserId: actor.userId,
      },
      select: journalEntrySelection,
    });
    const outcome = await transaction.auditEvent.findUnique({
      where: {
        operationId_type: {
          operationId: intent.operationId,
          type: "OUTCOME",
        },
      },
      select: { result: true, resolvedTargetId: true },
    });

    const signingCompleted =
      entry?.status === JournalEntryStatus.SIGNED &&
      entry.version === expectedVersion + 1 &&
      entry.signedAt !== null &&
      entry.signerUserId === actor.userId &&
      entry.signerName === actor.name &&
      entry.signerProfessionalTitle === actor.professionalTitle &&
      entry.signerRole === actor.role;
    const successfulOutcome =
      outcome?.result === "SUCCEEDED" &&
      outcome.resolvedTargetId === journalEntryId;

    if (signingCompleted && successfulOutcome) {
      return { state: "COMPLETED", value: entry };
    }

    const signingRolledBack =
      entry?.status === JournalEntryStatus.DRAFT &&
      entry.version === expectedVersion;
    if (signingRolledBack && !outcome) return { state: "ROLLED_BACK" };

    return { state: "UNKNOWN" };
  });
}

export function verifySigningTransactionCompletionForTest(
  intent: AuditIntentHandle,
  actor: ApplicationUser,
  clientId: string,
  journalEntryId: string,
  expectedVersion: number,
) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Journal test support is available only in tests.");
  }
  return verifySigningTransactionCompletion(
    intent,
    actor,
    clientId,
    journalEntryId,
    expectedVersion,
  );
}

export async function getCurrentJournalDraftInternal(
  input: ClientJournalQueryInput,
  actor: ApplicationUser,
): Promise<JournalEntryRecord | null> {
  const parsed = clientJournalQueryInputSchema.parse(input);

  try {
    return await prisma.$transaction(async (transaction) => {
      const currentActor = await requireClientForWork(
        transaction,
        actor,
        parsed.clientId,
      );
      return findCurrentDraft(transaction, currentActor, parsed.clientId);
    });
  } catch (error) {
    return throwPublicJournalError(error);
  }
}

export async function createJournalDraftInternal(
  input: CreateJournalDraftInput,
  actor: ApplicationUser,
): Promise<Readonly<{ created: boolean; draft: JournalEntryRecord }>> {
  const parsed = createJournalDraftInputSchema.parse(input);
  const journalEntryId = randomUUID();

  try {
    return await prisma.$transaction(async (transaction) => {
      await lockClientForMutation(transaction, parsed.clientId);
      const currentActor = await requireClientForWork(
        transaction,
        actor,
        parsed.clientId,
      );
      const existing = await findCurrentDraft(
        transaction,
        currentActor,
        parsed.clientId,
      );
      if (existing) return { created: false, draft: existing };

      const draft = await transaction.journalEntry.create({
        data: {
          id: journalEntryId,
          reference: createJournalReference(),
          organisationId: currentActor.organisationId,
          clientId: parsed.clientId,
          authorUserId: currentActor.userId,
          status: JournalEntryStatus.DRAFT,
          entryType: parsed.entryType,
          eventOccurredAt: parsed.eventOccurredAt,
          ...getJournalContentData(parsed),
          version: 1,
        },
        select: journalEntrySelection,
      });
      return { created: true, draft };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const draft = await getCurrentJournalDraftInternal(
        { clientId: parsed.clientId },
        actor,
      );
      if (draft) return { created: false, draft };
    }

    return throwPublicJournalError(error);
  }
}

export async function saveJournalDraftInternal(
  input: SaveJournalDraftInput,
  actor: ApplicationUser,
): Promise<JournalEntryRecord> {
  const parsed = saveJournalDraftInputSchema.parse(input);

  try {
    return await prisma.$transaction(async (transaction) => {
      const identity = await findOwnedEntryIdentity(
        transaction,
        actor,
        parsed.journalEntryId,
      );
      if (!identity) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }
      await lockClientForMutation(transaction, identity.clientId);
      const currentActor = await requireCurrentActor(transaction, actor);
      const current = await findOwnedAccessibleEntry(
        transaction,
        currentActor,
        parsed.journalEntryId,
      );
      if (!current || current.status !== JournalEntryStatus.DRAFT) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitiveJournalMutationError("STALE_VERSION");
      }

      const updated = await transaction.journalEntry.updateMany({
        where: {
          id: current.id,
          organisationId: currentActor.organisationId,
          authorUserId: currentActor.userId,
          status: JournalEntryStatus.DRAFT,
          version: parsed.expectedVersion,
        },
        data: {
          entryType: parsed.entryType,
          eventOccurredAt: parsed.eventOccurredAt,
          ...getJournalContentData(parsed),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new DefinitiveJournalMutationError("STALE_VERSION");
      }

      const draft = await transaction.journalEntry.findUnique({
        where: { id: current.id },
        select: journalEntrySelection,
      });
      if (!draft || draft.status !== JournalEntryStatus.DRAFT) {
        throw new DefinitiveJournalMutationError();
      }
      return draft;
    });
  } catch (error) {
    return throwPublicJournalError(error);
  }
}

export async function listAvailableJournalGoalsInternal(
  input: ClientJournalQueryInput,
  actor: ApplicationUser,
): Promise<readonly AvailableJournalGoal[]> {
  const parsed = clientJournalQueryInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (transaction) => {
      const currentActor = await requireClientForWork(
        transaction,
        actor,
        parsed.clientId,
      );
      return transaction.goal.findMany({
        where: {
          organisationId: currentActor.organisationId,
          clientId: parsed.clientId,
          client: { is: getOrdinaryClientAccessWhere(currentActor) },
        },
        orderBy: [{ status: "asc" }, { startDate: "desc" }, { id: "asc" }],
        select: { id: true, title: true, status: true },
      });
    });
  } catch (error) {
    return throwPublicJournalError(error);
  }
}

export async function replaceJournalDraftGoalsInternal(
  input: ReplaceJournalDraftGoalsInput,
  actor: ApplicationUser,
  testDependencies?: JournalTestDependencies,
): Promise<Readonly<{ changed: boolean; draft: JournalEntryRecord }>> {
  const parsed = replaceJournalDraftGoalsInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  try {
    return await prisma.$transaction(async (transaction) => {
      const identity = await findOwnedEntryIdentity(
        transaction,
        actor,
        parsed.journalEntryId,
      );
      if (!identity) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }
      await lockClientForMutation(transaction, identity.clientId);
      const currentActor = await requireCurrentActor(transaction, actor);
      const current = await findOwnedAccessibleEntry(
        transaction,
        currentActor,
        parsed.journalEntryId,
      );
      if (!current || current.status !== JournalEntryStatus.DRAFT) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitiveJournalMutationError("STALE_VERSION");
      }

      const goals = await transaction.goal.findMany({
        where: {
          id: { in: parsed.goalIds },
          organisationId: currentActor.organisationId,
          clientId: current.clientId,
        },
        select: { id: true },
      });
      if (goals.length !== parsed.goalIds.length) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }

      const existing = await transaction.journalGoalReference.findMany({
        where: { journalEntryId: current.id },
        orderBy: { goalId: "asc" },
        select: { goalId: true },
      });
      const nextIds = [...parsed.goalIds].sort();
      if (
        existing.length === nextIds.length &&
        existing.every(({ goalId }, index) => goalId === nextIds[index])
      ) {
        const draft = await transaction.journalEntry.findUnique({
          where: { id: current.id },
          select: journalEntrySelection,
        });
        if (!draft) throw new DefinitiveJournalMutationError();
        return { changed: false, draft };
      }

      await transaction.journalGoalReference.deleteMany({
        where: { journalEntryId: current.id },
      });
      if (nextIds.length > 0) {
        await transaction.journalGoalReference.createMany({
          data: nextIds.map((goalId) => ({
            organisationId: currentActor.organisationId,
            clientId: current.clientId,
            journalEntryId: current.id,
            goalId,
            titleSnapshot: null,
          })),
        });
      }
      const updated = await transaction.journalEntry.updateMany({
        where: {
          id: current.id,
          organisationId: currentActor.organisationId,
          authorUserId: currentActor.userId,
          status: JournalEntryStatus.DRAFT,
          version: parsed.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new DefinitiveJournalMutationError("STALE_VERSION");
      }
      await dependencies.afterDraftGoalMutation?.();
      const draft = await transaction.journalEntry.findUnique({
        where: { id: current.id },
        select: journalEntrySelection,
      });
      if (!draft || draft.status !== JournalEntryStatus.DRAFT) {
        throw new DefinitiveJournalMutationError();
      }
      return { changed: true, draft };
    });
  } catch (error) {
    return throwPublicJournalError(error);
  }
}

export async function discardJournalDraftInternal(
  input: DiscardJournalDraftInput,
  actor: ApplicationUser,
): Promise<void> {
  const parsed = discardJournalDraftInputSchema.parse(input);

  try {
    await prisma.$transaction(async (transaction) => {
      const identity = await findOwnedEntryIdentity(
        transaction,
        actor,
        parsed.journalEntryId,
      );
      if (!identity) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }
      await lockClientForMutation(transaction, identity.clientId);
      const currentActor = await requireCurrentActor(transaction, actor);
      const current = await findOwnedAccessibleEntry(
        transaction,
        currentActor,
        parsed.journalEntryId,
      );
      if (!current || current.status !== JournalEntryStatus.DRAFT) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitiveJournalMutationError("STALE_VERSION");
      }

      await transaction.journalGoalReference.deleteMany({
        where: { journalEntryId: current.id },
      });

      const discarded = await transaction.journalEntry.deleteMany({
        where: {
          id: current.id,
          organisationId: currentActor.organisationId,
          authorUserId: currentActor.userId,
          status: JournalEntryStatus.DRAFT,
          version: parsed.expectedVersion,
        },
      });
      if (discarded.count !== 1) {
        throw new DefinitiveJournalMutationError("STALE_VERSION");
      }
    });
  } catch (error) {
    return throwPublicJournalError(error);
  }
}

export async function listSignedJournalEntriesInternal(
  input: ClientJournalQueryInput,
  actor: ApplicationUser,
): Promise<readonly JournalEntryRecord[]> {
  const parsed = clientJournalQueryInputSchema.parse(input);

  try {
    return await prisma.$transaction(async (transaction) => {
      const currentActor = await requireClientForSignedRead(
        transaction,
        actor,
        parsed.clientId,
      );
      return transaction.journalEntry.findMany({
        where: {
          organisationId: currentActor.organisationId,
          clientId: parsed.clientId,
          status: JournalEntryStatus.SIGNED,
          client: { is: getClientDetailAccessWhere(currentActor) },
        },
        orderBy: [
          { eventOccurredAt: "desc" },
          { signedAt: "desc" },
          { id: "desc" },
        ],
        select: journalEntrySelection,
      });
    });
  } catch (error) {
    return throwPublicJournalError(error);
  }
}

export async function getSignedJournalEntryInternal(
  input: JournalEntryQueryInput,
  actor: ApplicationUser,
): Promise<SignedJournalEntryDetail> {
  const parsed = journalEntryQueryInputSchema.parse(input);

  try {
    const currentActor = await requireCurrentActor(prisma, actor);
    const entry = await prisma.journalEntry.findFirst({
      where: {
        id: parsed.journalEntryId,
        organisationId: currentActor.organisationId,
        status: JournalEntryStatus.SIGNED,
        client: { is: getClientDetailAccessWhere(currentActor) },
      },
      select: signedJournalEntryDetailSelection,
    });
    if (!entry) {
      throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
    }
    return entry;
  } catch (error) {
    return throwPublicJournalError(error);
  }
}

export async function beginJournalCorrectionInternal(
  input: BeginJournalCorrectionInput,
  actor: ApplicationUser,
): Promise<Readonly<{ created: boolean; draft: JournalEntryRecord }>> {
  const parsed = beginJournalCorrectionInputSchema.parse(input);

  const createOrReopen = async (
    transaction: Prisma.TransactionClient,
  ): Promise<Readonly<{ created: boolean; draft: JournalEntryRecord }>> => {
    let currentActor = await requireCurrentActor(transaction, actor);
    let original = await transaction.journalEntry.findFirst({
      where: {
        id: parsed.originalEntryId,
        organisationId: currentActor.organisationId,
        status: JournalEntryStatus.SIGNED,
        correctionOfId: null,
        client: { is: getOrdinaryClientAccessWhere(currentActor) },
      },
      select: { id: true, clientId: true },
    });
    if (!original) {
      throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
    }
    await lockClientForMutation(transaction, original.clientId);
    currentActor = await requireCurrentActor(transaction, actor);
    original = await transaction.journalEntry.findFirst({
      where: {
        id: parsed.originalEntryId,
        organisationId: currentActor.organisationId,
        status: JournalEntryStatus.SIGNED,
        correctionOfId: null,
        client: { is: getOrdinaryClientAccessWhere(currentActor) },
      },
      select: { id: true, clientId: true },
    });
    if (!original) {
      throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
    }

    const existing = await findCurrentDraft(
      transaction,
      currentActor,
      original.clientId,
    );
    if (existing) {
      if (existing.correctionOfId === original.id) {
        return { created: false, draft: existing };
      }
      throw new DefinitiveJournalMutationError("OPEN_DRAFT_CONFLICT");
    }

    const draft = await transaction.journalEntry.create({
      data: {
        id: randomUUID(),
        reference: createJournalReference(),
        organisationId: currentActor.organisationId,
        clientId: original.clientId,
        authorUserId: currentActor.userId,
        status: JournalEntryStatus.DRAFT,
        entryType: parsed.entryType,
        eventOccurredAt: parsed.eventOccurredAt,
        ...getJournalContentData(parsed),
        version: 1,
        correctionOfId: original.id,
      },
      select: journalEntrySelection,
    });
    return { created: true, draft };
  };

  try {
    return await prisma.$transaction(createOrReopen);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      try {
        return await prisma.$transaction(createOrReopen);
      } catch (classifiedError) {
        return throwPublicJournalError(classifiedError);
      }
    }
    return throwPublicJournalError(error);
  }
}

export async function signJournalDraftInternal(
  input: SignJournalDraftInput,
  actor: ApplicationUser,
  testDependencies?: JournalTestDependencies,
): Promise<JournalEntryRecord> {
  const parsed = signJournalDraftInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);

  let preflightActor: ApplicationUser;
  let preflightClientId: string;
  let auditAction: AuditAction;
  try {
    const preflight = await prisma.$transaction(async (transaction) => {
      const identity = await findOwnedEntryIdentity(
        transaction,
        actor,
        parsed.journalEntryId,
      );
      if (!identity) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }
      await lockClientForMutation(transaction, identity.clientId);
      const currentActor = await requireCurrentActor(transaction, actor);
      const entry = await findOwnedAccessibleEntry(
        transaction,
        currentActor,
        parsed.journalEntryId,
      );
      if (!entry) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }
      if (entry.status !== JournalEntryStatus.DRAFT) {
        throw new DefinitiveJournalMutationError("SIGNING_CONFLICT");
      }
      if (entry.version !== parsed.expectedVersion) {
        throw new DefinitiveJournalMutationError("STALE_VERSION");
      }
      return {
        currentActor,
        clientId: entry.clientId,
        correctionOfId: entry.correctionOfId,
      };
    });
    preflightActor = preflight.currentActor;
    preflightClientId = preflight.clientId;
    auditAction = preflight.correctionOfId
      ? "JOURNAL_CORRECTION_SIGNED"
      : "JOURNAL_ENTRY_SIGNED";
  } catch (error) {
    return throwPublicJournalError(error);
  }

  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor: preflightActor,
    action: auditAction,
    target: { targetId: parsed.journalEntryId },
  });

  try {
    await dependencies.beforeSigningTransaction?.();
  } catch (error) {
    return finishFailed(intent, error);
  }

  const result = await runJournalSigningTransaction<
    Prisma.TransactionClient,
    JournalEntryRecord
  >(
    (callback) => prisma.$transaction(callback),
    async (transaction) => {
      await lockClientForMutation(transaction, preflightClientId);
      const currentActor = await requireCurrentActor(transaction, actor);
      const current = await findOwnedAccessibleEntry(
        transaction,
        currentActor,
        parsed.journalEntryId,
      );
      if (!current) {
        throw new DefinitiveJournalMutationError("TARGET_UNAVAILABLE");
      }
      if (current.status !== JournalEntryStatus.DRAFT) {
        throw new DefinitiveJournalMutationError("SIGNING_CONFLICT");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitiveJournalMutationError("STALE_VERSION");
      }
      const expectedAction: AuditAction = current.correctionOfId
        ? "JOURNAL_CORRECTION_SIGNED"
        : "JOURNAL_ENTRY_SIGNED";
      if (expectedAction !== auditAction) {
        throw new DefinitiveJournalMutationError();
      }

      const signedAt = new Date();
      const signed = await transaction.journalEntry.updateMany({
        where: {
          id: current.id,
          organisationId: currentActor.organisationId,
          authorUserId: currentActor.userId,
          status: JournalEntryStatus.DRAFT,
          version: parsed.expectedVersion,
        },
        data: {
          status: JournalEntryStatus.SIGNED,
          version: { increment: 1 },
          signedAt,
          signerUserId: currentActor.userId,
          signerName: currentActor.name,
          signerProfessionalTitle: currentActor.professionalTitle,
          signerRole: currentActor.role,
        },
      });
      if (signed.count !== 1) {
        const raced = await transaction.journalEntry.findFirst({
          where: {
            id: current.id,
            organisationId: currentActor.organisationId,
            authorUserId: currentActor.userId,
          },
          select: { status: true, version: true },
        });
        throw new DefinitiveJournalMutationError(
          raced?.status === JournalEntryStatus.SIGNED
            ? "SIGNING_CONFLICT"
            : "STALE_VERSION",
        );
      }

      await dependencies.afterSigningMutation?.();
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        current.id,
      );
      await dependencies.afterSigningAuditOutcome?.(transaction);

      const entry = await transaction.journalEntry.findUnique({
        where: { id: current.id },
        select: journalEntrySelection,
      });
      if (!entry || entry.status !== JournalEntryStatus.SIGNED) {
        throw new DefinitiveJournalMutationError();
      }
      return entry;
    },
    () =>
      verifySigningTransactionCompletion(
        intent,
        preflightActor,
        preflightClientId,
        parsed.journalEntryId,
        parsed.expectedVersion,
      ),
  );

  if (result.state === "COMPLETED") return result.value;
  if (result.state === "ROLLED_BACK") {
    return finishFailed(intent, result.error);
  }
  return finishAmbiguous(intent);
}
