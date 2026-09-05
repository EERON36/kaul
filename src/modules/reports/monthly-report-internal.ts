import "server-only";

import { randomUUID } from "node:crypto";

import {
  MonthlyReportStatus,
  type Prisma,
} from "../../generated/prisma/client";
import {
  hasMeaningfulStructuredContent,
  type StructuredSectionValues,
} from "../../lib/structured-sections";
import { prisma } from "../../lib/prisma";
import {
  appendAuditOutcomeInTransaction,
  AuditError,
  createUserAuditIntent,
  recordAmbiguousAuditOutcome,
  recordFailedAuditOutcome,
  type AuditIntentHandle,
} from "../audit/audit";
import type { ApplicationUser } from "../authentication/guards";
import {
  getClientDetailAccessWhere,
  getOrdinaryClientAccessWhere,
} from "../clients/client-access";
import { lockClientForMutation } from "../clients/client-mutation-lock";
import {
  beginMonthlyReportReplacementInputSchema,
  clientMonthlyReportsQueryInputSchema,
  createMonthlyReportDraftInputSchema,
  monthlyReportQueryInputSchema,
  saveMonthlyReportDraftInputSchema,
  signMonthlyReportDraftInputSchema,
  type BeginMonthlyReportReplacementInput,
  type ClientMonthlyReportsQueryInput,
  type CreateMonthlyReportDraftInput,
  type MonthlyReportQueryInput,
  type SaveMonthlyReportDraftInput,
  type SignMonthlyReportDraftInput,
} from "./monthly-report-input";
import {
  runMonthlyReportSigningTransaction,
  type MonthlyReportSigningTransactionVerification,
} from "./monthly-report-signing-transaction";

const MONTHLY_REPORT_ERROR_MESSAGE =
  "Monthly report requirement not satisfied.";

export type MonthlyReportErrorCode =
  | "TARGET_UNAVAILABLE"
  | "SIGNED_REPORT_EXISTS"
  | "STALE_VERSION"
  | "SIGNING_CONFLICT"
  | "CONTENT_REQUIRED"
  | "INCONSISTENT_RESULT"
  | "OPERATION_AMBIGUOUS";

export class MonthlyReportError extends Error {
  readonly code: MonthlyReportErrorCode;

  constructor(code: MonthlyReportErrorCode) {
    super(MONTHLY_REPORT_ERROR_MESSAGE);
    Object.defineProperty(this, "name", {
      value: "MonthlyReportError",
      configurable: true,
    });
    this.code = code;
  }
}

type DefinitiveMonthlyReportErrorCode = Exclude<
  MonthlyReportErrorCode,
  "INCONSISTENT_RESULT" | "OPERATION_AMBIGUOUS"
>;

class DefinitiveMonthlyReportMutationError extends Error {
  readonly code?: DefinitiveMonthlyReportErrorCode;

  constructor(code?: DefinitiveMonthlyReportErrorCode) {
    super("Monthly report mutation failed.");
    this.code = code;
  }
}

export type MonthlyReportTestDependencies = Readonly<{
  beforeReportQuery?: () => void | Promise<void>;
  afterDraftMutation?: () => void | Promise<void>;
  beforeSigningTransaction?: () => void | Promise<void>;
  afterSigningMutation?: () => void | Promise<void>;
  afterSigningAuditOutcome?: (
    transaction: Prisma.TransactionClient,
  ) => void | Promise<void>;
}>;

const monthlyReportSelection = {
  id: true,
  reference: true,
  organisationId: true,
  clientId: true,
  calendarYear: true,
  calendarMonth: true,
  revision: true,
  replacesReportId: true,
  replacesReport: { select: { id: true, reference: true } },
  replacement: {
    select: { id: true, reference: true, status: true },
  },
  status: true,
  healthContent: true,
  educationOccupationContent: true,
  emotionsBehaviorContent: true,
  socialRelationsContent: true,
  dailyLivingIndependenceContent: true,
  otherContent: true,
  version: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
  signedAt: true,
  signerUserId: true,
  signerName: true,
  signerProfessionalTitle: true,
  signerRole: true,
} satisfies Prisma.MonthlyReportSelect;

export type MonthlyReportRecord = Readonly<
  Prisma.MonthlyReportGetPayload<{ select: typeof monthlyReportSelection }>
>;

type MonthlyReportDatabase = Pick<
  Prisma.TransactionClient,
  "user" | "client" | "monthlyReport"
>;

function getTestDependencies(
  dependencies?: MonthlyReportTestDependencies,
): MonthlyReportTestDependencies {
  if (dependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error(
      "Monthly report test dependencies are available only in tests.",
    );
  }
  return dependencies ?? {};
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function createMonthlyReportReference(): string {
  return `MRP-${randomUUID().toUpperCase()}`;
}

function reportSections(report: {
  healthContent: string | null;
  educationOccupationContent: string | null;
  emotionsBehaviorContent: string | null;
  socialRelationsContent: string | null;
  dailyLivingIndependenceContent: string | null;
  otherContent: string | null;
}): StructuredSectionValues {
  return {
    healthContent: report.healthContent ?? "",
    educationOccupationContent: report.educationOccupationContent ?? "",
    emotionsBehaviorContent: report.emotionsBehaviorContent ?? "",
    socialRelationsContent: report.socialRelationsContent ?? "",
    dailyLivingIndependenceContent: report.dailyLivingIndependenceContent ?? "",
    otherContent: report.otherContent ?? "",
  };
}

async function requireCurrentActor(
  database: MonthlyReportDatabase,
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
    throw new DefinitiveMonthlyReportMutationError("TARGET_UNAVAILABLE");
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
  database: MonthlyReportDatabase,
  actor: ApplicationUser,
  clientId: string,
): Promise<ApplicationUser> {
  const currentActor = await requireCurrentActor(database, actor);
  const client = await database.client.findFirst({
    where: { id: clientId, ...getOrdinaryClientAccessWhere(currentActor) },
    select: { id: true },
  });
  if (!client) {
    throw new DefinitiveMonthlyReportMutationError("TARGET_UNAVAILABLE");
  }
  return currentActor;
}

function throwPublicMonthlyReportError(error: unknown): never {
  if (error instanceof MonthlyReportError) throw error;
  if (error instanceof DefinitiveMonthlyReportMutationError && error.code) {
    throw new MonthlyReportError(error.code);
  }
  throw new MonthlyReportError("INCONSISTENT_RESULT");
}

async function finishFailed(
  intent: AuditIntentHandle,
  error: unknown,
): Promise<never> {
  await recordFailedAuditOutcome(intent);
  if (error instanceof AuditError) throw error;
  return throwPublicMonthlyReportError(error);
}

async function finishAmbiguous(intent: AuditIntentHandle): Promise<never> {
  await recordAmbiguousAuditOutcome(intent);
  throw new MonthlyReportError("OPERATION_AMBIGUOUS");
}

function getMonthlyReportReadWhere(
  actor: ApplicationUser,
): Prisma.MonthlyReportWhereInput {
  return {
    organisationId: actor.organisationId,
    OR: [
      {
        status: MonthlyReportStatus.DRAFT,
        client: { is: getOrdinaryClientAccessWhere(actor) },
      },
      {
        status: MonthlyReportStatus.SIGNED,
        client: { is: getClientDetailAccessWhere(actor) },
      },
    ],
  };
}

export async function listMonthlyReportsInternal(
  input: ClientMonthlyReportsQueryInput,
  actor: ApplicationUser,
  testDependencies?: MonthlyReportTestDependencies,
): Promise<readonly MonthlyReportRecord[]> {
  const parsed = clientMonthlyReportsQueryInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  try {
    return await prisma.$transaction(async (transaction) => {
      const currentActor = await requireCurrentActor(transaction, actor);
      const client = await transaction.client.findFirst({
        where: {
          id: parsed.clientId,
          ...getClientDetailAccessWhere(currentActor),
        },
        select: { id: true },
      });
      if (!client) {
        throw new DefinitiveMonthlyReportMutationError("TARGET_UNAVAILABLE");
      }
      await dependencies.beforeReportQuery?.();

      return transaction.monthlyReport.findMany({
        where: {
          clientId: parsed.clientId,
          ...getMonthlyReportReadWhere(currentActor),
        },
        orderBy: [
          { calendarYear: "desc" },
          { calendarMonth: "desc" },
          { revision: "desc" },
        ],
        select: monthlyReportSelection,
      });
    });
  } catch (error) {
    return throwPublicMonthlyReportError(error);
  }
}

export async function getMonthlyReportInternal(
  input: MonthlyReportQueryInput,
  actor: ApplicationUser,
): Promise<MonthlyReportRecord> {
  const parsed = monthlyReportQueryInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (transaction) => {
      const currentActor = await requireCurrentActor(transaction, actor);
      const report = await transaction.monthlyReport.findFirst({
        where: {
          id: parsed.monthlyReportId,
          ...getMonthlyReportReadWhere(currentActor),
        },
        select: monthlyReportSelection,
      });
      if (!report) {
        throw new DefinitiveMonthlyReportMutationError("TARGET_UNAVAILABLE");
      }
      return report;
    });
  } catch (error) {
    return throwPublicMonthlyReportError(error);
  }
}

export async function createMonthlyReportDraftInternal(
  input: CreateMonthlyReportDraftInput,
  actor: ApplicationUser,
): Promise<Readonly<{ created: boolean; draft: MonthlyReportRecord }>> {
  const parsed = createMonthlyReportDraftInputSchema.parse(input);
  const createOrReopen = async (transaction: Prisma.TransactionClient) => {
    await lockClientForMutation(transaction, parsed.clientId);
    const currentActor = await requireClientForWork(
      transaction,
      actor,
      parsed.clientId,
    );
    const existingDraft = await transaction.monthlyReport.findFirst({
      where: {
        organisationId: currentActor.organisationId,
        clientId: parsed.clientId,
        calendarYear: parsed.calendarYear,
        calendarMonth: parsed.calendarMonth,
        status: MonthlyReportStatus.DRAFT,
      },
      select: monthlyReportSelection,
    });
    if (existingDraft) return { created: false, draft: existingDraft };

    const signed = await transaction.monthlyReport.findFirst({
      where: {
        organisationId: currentActor.organisationId,
        clientId: parsed.clientId,
        calendarYear: parsed.calendarYear,
        calendarMonth: parsed.calendarMonth,
        status: MonthlyReportStatus.SIGNED,
      },
      select: { id: true },
    });
    if (signed) {
      throw new DefinitiveMonthlyReportMutationError("SIGNED_REPORT_EXISTS");
    }

    const draft = await transaction.monthlyReport.create({
      data: {
        id: randomUUID(),
        reference: createMonthlyReportReference(),
        organisationId: currentActor.organisationId,
        clientId: parsed.clientId,
        calendarYear: parsed.calendarYear,
        calendarMonth: parsed.calendarMonth,
        revision: 1,
        status: MonthlyReportStatus.DRAFT,
        version: 1,
        createdByUserId: currentActor.userId,
        updatedByUserId: currentActor.userId,
      },
      select: monthlyReportSelection,
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
        return throwPublicMonthlyReportError(classifiedError);
      }
    }
    return throwPublicMonthlyReportError(error);
  }
}

export async function saveMonthlyReportDraftInternal(
  input: SaveMonthlyReportDraftInput,
  actor: ApplicationUser,
  testDependencies?: MonthlyReportTestDependencies,
): Promise<MonthlyReportRecord> {
  const parsed = saveMonthlyReportDraftInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);

  try {
    return await prisma.$transaction(async (transaction) => {
      const identity = await transaction.monthlyReport.findFirst({
        where: {
          id: parsed.monthlyReportId,
          organisationId: actor.organisationId,
        },
        select: { clientId: true },
      });
      if (!identity) {
        throw new DefinitiveMonthlyReportMutationError("TARGET_UNAVAILABLE");
      }
      await lockClientForMutation(transaction, identity.clientId);
      const currentActor = await requireClientForWork(
        transaction,
        actor,
        identity.clientId,
      );
      const updated = await transaction.monthlyReport.updateMany({
        where: {
          id: parsed.monthlyReportId,
          organisationId: currentActor.organisationId,
          status: MonthlyReportStatus.DRAFT,
          version: parsed.expectedVersion,
        },
        data: {
          healthContent: parsed.healthContent,
          educationOccupationContent: parsed.educationOccupationContent,
          emotionsBehaviorContent: parsed.emotionsBehaviorContent,
          socialRelationsContent: parsed.socialRelationsContent,
          dailyLivingIndependenceContent: parsed.dailyLivingIndependenceContent,
          otherContent: parsed.otherContent,
          updatedByUserId: currentActor.userId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        const raced = await transaction.monthlyReport.findFirst({
          where: {
            id: parsed.monthlyReportId,
            organisationId: currentActor.organisationId,
          },
          select: { status: true },
        });
        throw new DefinitiveMonthlyReportMutationError(
          raced?.status === MonthlyReportStatus.SIGNED
            ? "SIGNING_CONFLICT"
            : "STALE_VERSION",
        );
      }
      await dependencies.afterDraftMutation?.();
      const draft = await transaction.monthlyReport.findUnique({
        where: { id: parsed.monthlyReportId },
        select: monthlyReportSelection,
      });
      if (!draft || draft.status !== MonthlyReportStatus.DRAFT) {
        throw new DefinitiveMonthlyReportMutationError();
      }
      return draft;
    });
  } catch (error) {
    return throwPublicMonthlyReportError(error);
  }
}

export async function beginMonthlyReportReplacementInternal(
  input: BeginMonthlyReportReplacementInput,
  actor: ApplicationUser,
): Promise<Readonly<{ created: boolean; draft: MonthlyReportRecord }>> {
  const parsed = beginMonthlyReportReplacementInputSchema.parse(input);
  const createOrReopen = async (transaction: Prisma.TransactionClient) => {
    const initial = await transaction.monthlyReport.findFirst({
      where: {
        id: parsed.monthlyReportId,
        organisationId: actor.organisationId,
        status: MonthlyReportStatus.SIGNED,
      },
      select: { clientId: true },
    });
    if (!initial) {
      throw new DefinitiveMonthlyReportMutationError("TARGET_UNAVAILABLE");
    }
    await lockClientForMutation(transaction, initial.clientId);
    const currentActor = await requireClientForWork(
      transaction,
      actor,
      initial.clientId,
    );
    const original = await transaction.monthlyReport.findFirst({
      where: {
        id: parsed.monthlyReportId,
        organisationId: currentActor.organisationId,
        status: MonthlyReportStatus.SIGNED,
      },
      select: monthlyReportSelection,
    });
    if (
      !original ||
      original.replacement?.status === MonthlyReportStatus.SIGNED
    ) {
      throw new DefinitiveMonthlyReportMutationError("TARGET_UNAVAILABLE");
    }
    const existingDraft = await transaction.monthlyReport.findFirst({
      where: {
        organisationId: currentActor.organisationId,
        clientId: original.clientId,
        calendarYear: original.calendarYear,
        calendarMonth: original.calendarMonth,
        replacesReportId: original.id,
        status: MonthlyReportStatus.DRAFT,
      },
      select: monthlyReportSelection,
    });
    if (existingDraft) return { created: false, draft: existingDraft };

    const draft = await transaction.monthlyReport.create({
      data: {
        id: randomUUID(),
        reference: createMonthlyReportReference(),
        organisationId: currentActor.organisationId,
        clientId: original.clientId,
        calendarYear: original.calendarYear,
        calendarMonth: original.calendarMonth,
        revision: original.revision + 1,
        replacesReportId: original.id,
        status: MonthlyReportStatus.DRAFT,
        ...reportSections(original),
        version: 1,
        createdByUserId: currentActor.userId,
        updatedByUserId: currentActor.userId,
      },
      select: monthlyReportSelection,
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
        return throwPublicMonthlyReportError(classifiedError);
      }
    }
    return throwPublicMonthlyReportError(error);
  }
}

async function verifySigningTransactionCompletion(
  intent: AuditIntentHandle,
  actor: ApplicationUser,
  clientId: string,
  reportId: string,
  expectedVersion: number,
): Promise<MonthlyReportSigningTransactionVerification<MonthlyReportRecord>> {
  return prisma.$transaction(async (transaction) => {
    await lockClientForMutation(transaction, clientId);

    const report = await transaction.monthlyReport.findFirst({
      where: {
        id: reportId,
        clientId,
        organisationId: actor.organisationId,
      },
      select: monthlyReportSelection,
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
      report?.status === MonthlyReportStatus.SIGNED &&
      report.version === expectedVersion + 1 &&
      report.signerUserId === actor.userId &&
      report.signerName === actor.name &&
      report.signerProfessionalTitle === actor.professionalTitle &&
      report.signerRole === actor.role;
    const successfulOutcome =
      outcome?.result === "SUCCEEDED" && outcome.resolvedTargetId === reportId;

    if (signingCompleted && successfulOutcome) {
      return { state: "COMPLETED", value: report };
    }
    if (
      report?.status === MonthlyReportStatus.DRAFT &&
      report.version === expectedVersion &&
      !outcome
    ) {
      return { state: "ROLLED_BACK" };
    }
    return { state: "UNKNOWN" };
  });
}

export async function signMonthlyReportDraftInternal(
  input: SignMonthlyReportDraftInput,
  actor: ApplicationUser,
  testDependencies?: MonthlyReportTestDependencies,
): Promise<MonthlyReportRecord> {
  const parsed = signMonthlyReportDraftInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  let preflightActor: ApplicationUser;
  let clientId: string;

  try {
    const preflight = await prisma.$transaction(async (transaction) => {
      const report = await transaction.monthlyReport.findFirst({
        where: {
          id: parsed.monthlyReportId,
          organisationId: actor.organisationId,
        },
        select: { clientId: true, status: true, version: true },
      });
      if (!report) {
        throw new DefinitiveMonthlyReportMutationError("TARGET_UNAVAILABLE");
      }
      await lockClientForMutation(transaction, report.clientId);
      const currentActor = await requireClientForWork(
        transaction,
        actor,
        report.clientId,
      );
      if (report.status !== MonthlyReportStatus.DRAFT) {
        throw new DefinitiveMonthlyReportMutationError("SIGNING_CONFLICT");
      }
      if (report.version !== parsed.expectedVersion) {
        throw new DefinitiveMonthlyReportMutationError("STALE_VERSION");
      }
      return { currentActor, clientId: report.clientId };
    });
    preflightActor = preflight.currentActor;
    clientId = preflight.clientId;
  } catch (error) {
    return throwPublicMonthlyReportError(error);
  }

  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor: preflightActor,
    action: "MONTHLY_REPORT_SIGNED",
    target: { targetId: parsed.monthlyReportId },
  });

  try {
    await dependencies.beforeSigningTransaction?.();
  } catch (error) {
    return finishFailed(intent, error);
  }

  const result = await runMonthlyReportSigningTransaction<
    Prisma.TransactionClient,
    MonthlyReportRecord
  >(
    (callback) => prisma.$transaction(callback),
    async (transaction) => {
      await lockClientForMutation(transaction, clientId);
      const currentActor = await requireClientForWork(
        transaction,
        actor,
        clientId,
      );
      const current = await transaction.monthlyReport.findFirst({
        where: {
          id: parsed.monthlyReportId,
          organisationId: currentActor.organisationId,
        },
        select: monthlyReportSelection,
      });
      if (!current) {
        throw new DefinitiveMonthlyReportMutationError("TARGET_UNAVAILABLE");
      }
      if (current.status !== MonthlyReportStatus.DRAFT) {
        throw new DefinitiveMonthlyReportMutationError("SIGNING_CONFLICT");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitiveMonthlyReportMutationError("STALE_VERSION");
      }
      if (!hasMeaningfulStructuredContent(reportSections(current))) {
        throw new DefinitiveMonthlyReportMutationError("CONTENT_REQUIRED");
      }

      const signedAt = new Date();
      const signed = await transaction.monthlyReport.updateMany({
        where: {
          id: current.id,
          organisationId: currentActor.organisationId,
          status: MonthlyReportStatus.DRAFT,
          version: parsed.expectedVersion,
        },
        data: {
          status: MonthlyReportStatus.SIGNED,
          version: { increment: 1 },
          signedAt,
          signerUserId: currentActor.userId,
          signerName: currentActor.name,
          signerProfessionalTitle: currentActor.professionalTitle,
          signerRole: currentActor.role,
        },
      });
      if (signed.count !== 1) {
        throw new DefinitiveMonthlyReportMutationError("SIGNING_CONFLICT");
      }
      await dependencies.afterSigningMutation?.();
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        current.id,
      );
      await dependencies.afterSigningAuditOutcome?.(transaction);

      const report = await transaction.monthlyReport.findUnique({
        where: { id: current.id },
        select: monthlyReportSelection,
      });
      if (!report || report.status !== MonthlyReportStatus.SIGNED) {
        throw new DefinitiveMonthlyReportMutationError();
      }
      return report;
    },
    () =>
      verifySigningTransactionCompletion(
        intent,
        preflightActor,
        clientId,
        parsed.monthlyReportId,
        parsed.expectedVersion,
      ),
  );

  if (result.state === "COMPLETED") return result.value;
  if (result.state === "ROLLED_BACK") {
    return finishFailed(intent, result.error);
  }
  return finishAmbiguous(intent);
}
