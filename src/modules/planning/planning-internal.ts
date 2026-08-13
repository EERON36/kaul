import "server-only";

import { randomUUID } from "node:crypto";

import {
  ClientStatus,
  FollowUpStatus,
  GoalStatus,
  UserRole,
  type Prisma,
} from "../../generated/prisma/client";
import {
  addCalendarDays,
  formatCalendarDate,
  formatStockholmCalendarDate,
  getFollowUpDueState,
  parseCalendarDate,
  resolveStockholmDateTime,
  type FollowUpDueState,
} from "../../lib/stockholm-time";
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
  runPlanningAuditTransaction,
  type PlanningAuditTransactionVerification,
} from "./planning-audit-transaction";
import {
  auditedFollowUpTransitionInputSchema,
  auditedGoalTransitionInputSchema,
  clientPlanningQueryInputSchema,
  createFollowUpInputSchema,
  createGoalInputSchema,
  followUpQueryInputSchema,
  goalQueryInputSchema,
  goalVersionInputSchema,
  reassignFollowUpInputSchema,
  updateFollowUpInputSchema,
  updateGoalInputSchema,
  type AuditedFollowUpTransitionInput,
  type AuditedGoalTransitionInput,
  type ClientPlanningQueryInput,
  type CreateFollowUpInput,
  type CreateGoalInput,
  type FollowUpQueryInput,
  type GoalQueryInput,
  type GoalVersionInput,
  type ReassignFollowUpInput,
  type UpdateFollowUpInput,
  type UpdateGoalInput,
} from "./planning-input";

const PLANNING_ERROR_MESSAGE = "Planning requirement not satisfied.";

export type PlanningErrorCode =
  | "TARGET_UNAVAILABLE"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "INVALID_RESPONSIBLE_USER"
  | "INVALID_GOAL_LINK"
  | "NO_CHANGES"
  | "INCONSISTENT_RESULT"
  | "OPERATION_AMBIGUOUS";

export class PlanningError extends Error {
  readonly code: PlanningErrorCode;

  constructor(code: PlanningErrorCode) {
    super(PLANNING_ERROR_MESSAGE);
    Object.defineProperty(this, "name", {
      value: "PlanningError",
      configurable: true,
    });
    this.code = code;
  }
}

type DefinitivePlanningErrorCode = Exclude<
  PlanningErrorCode,
  "INCONSISTENT_RESULT" | "OPERATION_AMBIGUOUS"
>;

class DefinitivePlanningError extends Error {
  readonly code?: DefinitivePlanningErrorCode;

  constructor(code?: DefinitivePlanningErrorCode) {
    super("Planning mutation failed.");
    this.code = code;
  }
}

export type PlanningTestDependencies = Readonly<{
  beforeBusinessTransaction?: () => void | Promise<void>;
  afterBusinessMutation?: (
    transaction: Prisma.TransactionClient,
  ) => void | Promise<void>;
}>;

const userSummarySelection = {
  id: true,
  name: true,
  professionalTitle: true,
} satisfies Prisma.UserSelect;

const goalSelection = {
  id: true,
  clientId: true,
  title: true,
  description: true,
  status: true,
  startDate: true,
  targetDate: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  completedAt: true,
  archivedAt: true,
  createdByUser: { select: userSummarySelection },
  completedByUser: { select: userSummarySelection },
  archivedByUser: { select: userSummarySelection },
} satisfies Prisma.GoalSelect;

const followUpSelection = {
  id: true,
  clientId: true,
  title: true,
  description: true,
  dueDate: true,
  dueTime: true,
  dueAt: true,
  status: true,
  goalId: true,
  goal: { select: { id: true, title: true, status: true } },
  createdAt: true,
  updatedAt: true,
  version: true,
  completedAt: true,
  cancelledAt: true,
  createdByUser: { select: userSummarySelection },
  responsibleUser: { select: userSummarySelection },
  completedByUser: { select: userSummarySelection },
  cancelledByUser: { select: userSummarySelection },
  responsibilityHistory: {
    orderBy: [{ changedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      changedAt: true,
      followUpVersion: true,
      previousResponsibleUser: { select: userSummarySelection },
      newResponsibleUser: { select: userSummarySelection },
      actorUser: { select: userSummarySelection },
    },
  },
} satisfies Prisma.FollowUpSelect;

type GoalRow = Prisma.GoalGetPayload<{ select: typeof goalSelection }>;
type FollowUpRow = Prisma.FollowUpGetPayload<{
  select: typeof followUpSelection;
}>;

export type GoalRecord = Readonly<GoalRow>;
export type FollowUpRecord = Readonly<
  FollowUpRow & { responsibilityNeedsReassignment: boolean }
>;
export type EligibleResponsibleUser = Readonly<
  Prisma.UserGetPayload<{ select: typeof userSummarySelection }>
>;
export type OwnFollowUpHomeItem = Readonly<{
  id: string;
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  title: string;
  dueDate: Date;
  dueTime: string | null;
  dueAt: Date | null;
  dueState: Exclude<FollowUpDueState, "OUTSIDE_WINDOW">;
  goal: Readonly<{ id: string; title: string }> | null;
}>;

type PlanningDatabase = Pick<
  Prisma.TransactionClient,
  "user" | "client" | "goal" | "followUp" | "followUpResponsibilityHistory"
>;

function getTestDependencies(
  dependencies?: PlanningTestDependencies,
): PlanningTestDependencies {
  if (dependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error("Planning test dependencies are available only in tests.");
  }
  return dependencies ?? {};
}

async function requireCurrentActor(
  database: PlanningDatabase,
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
  if (!current || current.organisation.id !== current.organisationId) {
    throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
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

async function requireClient(
  database: PlanningDatabase,
  actor: ApplicationUser,
  clientId: string,
  mode: "READ" | "WORK",
): Promise<ApplicationUser> {
  const currentActor = await requireCurrentActor(database, actor);
  const client = await database.client.findFirst({
    where: {
      id: clientId,
      ...(mode === "READ"
        ? getClientDetailAccessWhere(currentActor)
        : getOrdinaryClientAccessWhere(currentActor)),
    },
    select: { id: true },
  });
  if (!client) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
  return currentActor;
}

async function requireMutableRecordClient(
  database: PlanningDatabase,
  actor: ApplicationUser,
  record: "GOAL" | "FOLLOW_UP",
  recordId: string,
): Promise<Readonly<{ actor: ApplicationUser; clientId: string }>> {
  const identity =
    record === "GOAL"
      ? await database.goal.findFirst({
          where: { id: recordId, organisationId: actor.organisationId },
          select: { clientId: true },
        })
      : await database.followUp.findFirst({
          where: { id: recordId, organisationId: actor.organisationId },
          select: { clientId: true },
        });
  if (!identity) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
  await lockClientForMutation(
    database as Prisma.TransactionClient,
    identity.clientId,
  );
  return {
    actor: await requireClient(database, actor, identity.clientId, "WORK"),
    clientId: identity.clientId,
  };
}

function throwPublicPlanningError(error: unknown): never {
  if (error instanceof PlanningError || error instanceof AuditError)
    throw error;
  if (error instanceof DefinitivePlanningError && error.code) {
    throw new PlanningError(error.code);
  }
  throw new PlanningError("INCONSISTENT_RESULT");
}

async function finishFailed(
  intent: AuditIntentHandle,
  error: unknown,
): Promise<never> {
  await recordFailedAuditOutcome(intent);
  return throwPublicPlanningError(error);
}

async function finishAmbiguous(intent: AuditIntentHandle): Promise<never> {
  await recordAmbiguousAuditOutcome(intent);
  throw new PlanningError("OPERATION_AMBIGUOUS");
}

function requiredCalendarDate(value: string): Date {
  const date = parseCalendarDate(value);
  if (!date) throw new DefinitivePlanningError();
  return date;
}

function followUpDueValues(dueDate: string, dueTime: string | null) {
  const date = requiredCalendarDate(dueDate);
  const dueAt = dueTime ? resolveStockholmDateTime(dueDate, dueTime) : null;
  if (dueTime && !dueAt) throw new DefinitivePlanningError();
  return { dueDate: date, dueTime, dueAt };
}

async function eligibleResponsibleUsers(
  database: PlanningDatabase,
  organisationId: string,
  clientId: string,
): Promise<readonly EligibleResponsibleUser[]> {
  const client = await database.client.findFirst({
    where: { id: clientId, organisationId },
    select: { status: true },
  });
  if (!client || client.status === ClientStatus.ARCHIVED) return [];

  return database.user.findMany({
    where: {
      organisationId,
      banned: { not: true },
      mustChangePassword: false,
      OR: [
        { role: UserRole.ADMINISTRATOR },
        {
          role: UserRole.STAFF_MEMBER,
          ...(client.status === ClientStatus.ACTIVE
            ? {
                staffAssignments: {
                  some: { clientId, organisationId, endedAt: null },
                },
              }
            : { id: "__no_staff_user_is_eligible__" }),
        },
      ],
    },
    orderBy: [{ name: "asc" }, { professionalTitle: "asc" }, { id: "asc" }],
    select: userSummarySelection,
  });
}

async function requireEligibleResponsibleUser(
  database: PlanningDatabase,
  organisationId: string,
  clientId: string,
  userId: string,
): Promise<void> {
  const eligible = await eligibleResponsibleUsers(
    database,
    organisationId,
    clientId,
  );
  if (!eligible.some((user) => user.id === userId)) {
    throw new DefinitivePlanningError("INVALID_RESPONSIBLE_USER");
  }
}

async function requireNewGoalLink(
  database: PlanningDatabase,
  organisationId: string,
  clientId: string,
  goalId: string | null,
): Promise<void> {
  if (!goalId) return;
  const goal = await database.goal.findFirst({
    where: {
      id: goalId,
      organisationId,
      clientId,
      status: { in: [GoalStatus.ACTIVE, GoalStatus.PAUSED] },
    },
    select: { id: true },
  });
  if (!goal) throw new DefinitivePlanningError("INVALID_GOAL_LINK");
}

async function addResponsibilityState(
  database: PlanningDatabase,
  organisationId: string,
  clientId: string,
  rows: readonly FollowUpRow[],
): Promise<readonly FollowUpRecord[]> {
  const client = await database.client.findFirst({
    where: { id: clientId, organisationId },
    select: { status: true },
  });
  if (!client) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
  if (client.status === ClientStatus.ARCHIVED) {
    return rows.map((row) => ({
      ...row,
      responsibilityNeedsReassignment: false,
    }));
  }
  const eligible = new Set(
    (await eligibleResponsibleUsers(database, organisationId, clientId)).map(
      ({ id }) => id,
    ),
  );
  return rows.map((row) => ({
    ...row,
    responsibilityNeedsReassignment: !eligible.has(row.responsibleUser.id),
  }));
}

export async function listGoalsInternal(
  input: ClientPlanningQueryInput,
  actor: ApplicationUser,
): Promise<readonly GoalRecord[]> {
  const parsed = clientPlanningQueryInputSchema.parse(input);
  try {
    const currentActor = await requireClient(
      prisma,
      actor,
      parsed.clientId,
      "READ",
    );
    return prisma.goal.findMany({
      where: {
        organisationId: currentActor.organisationId,
        clientId: parsed.clientId,
        client: { is: getClientDetailAccessWhere(currentActor) },
      },
      orderBy: [{ status: "asc" }, { startDate: "desc" }, { id: "asc" }],
      select: goalSelection,
    });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

export async function getGoalInternal(
  input: GoalQueryInput,
  actor: ApplicationUser,
): Promise<GoalRecord> {
  const parsed = goalQueryInputSchema.parse(input);
  try {
    const currentActor = await requireCurrentActor(prisma, actor);
    const goal = await prisma.goal.findFirst({
      where: {
        id: parsed.goalId,
        organisationId: currentActor.organisationId,
        client: { is: getClientDetailAccessWhere(currentActor) },
      },
      select: goalSelection,
    });
    if (!goal) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
    return goal;
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

export async function createGoalInternal(
  input: CreateGoalInput,
  actor: ApplicationUser,
): Promise<GoalRecord> {
  const parsed = createGoalInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (transaction) => {
      await lockClientForMutation(transaction, parsed.clientId);
      const currentActor = await requireClient(
        transaction,
        actor,
        parsed.clientId,
        "WORK",
      );
      return transaction.goal.create({
        data: {
          id: randomUUID(),
          organisationId: currentActor.organisationId,
          clientId: parsed.clientId,
          title: parsed.title,
          description: parsed.description,
          status: GoalStatus.ACTIVE,
          startDate: requiredCalendarDate(parsed.startDate),
          targetDate: parsed.targetDate
            ? requiredCalendarDate(parsed.targetDate)
            : null,
          createdByUserId: currentActor.userId,
          version: 1,
        },
        select: goalSelection,
      });
    });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

export async function updateGoalInternal(
  input: UpdateGoalInput,
  actor: ApplicationUser,
  testDependencies?: PlanningTestDependencies,
): Promise<Readonly<{ changed: boolean; goal: GoalRecord }>> {
  const parsed = updateGoalInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  const next = {
    title: parsed.title,
    description: parsed.description,
    startDate: requiredCalendarDate(parsed.startDate),
    targetDate: parsed.targetDate
      ? requiredCalendarDate(parsed.targetDate)
      : null,
  };
  try {
    return await prisma.$transaction(async (transaction) => {
      const access = await requireMutableRecordClient(
        transaction,
        actor,
        "GOAL",
        parsed.goalId,
      );
      const current = await transaction.goal.findFirst({
        where: {
          id: parsed.goalId,
          organisationId: access.actor.organisationId,
          clientId: access.clientId,
        },
        select: goalSelection,
      });
      if (!current) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      if (
        current.status !== GoalStatus.ACTIVE &&
        current.status !== GoalStatus.PAUSED
      ) {
        throw new DefinitivePlanningError("INVALID_STATE");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitivePlanningError("STALE_VERSION");
      }
      const changed =
        current.title !== next.title ||
        current.description !== next.description ||
        formatCalendarDate(current.startDate) !==
          formatCalendarDate(next.startDate) ||
        (current.targetDate ? formatCalendarDate(current.targetDate) : null) !==
          (next.targetDate ? formatCalendarDate(next.targetDate) : null);
      if (!changed) return { changed: false, goal: current };

      const updated = await transaction.goal.updateMany({
        where: {
          id: current.id,
          organisationId: access.actor.organisationId,
          version: parsed.expectedVersion,
          status: { in: [GoalStatus.ACTIVE, GoalStatus.PAUSED] },
        },
        data: { ...next, version: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new DefinitivePlanningError("STALE_VERSION");
      await dependencies.afterBusinessMutation?.(transaction);
      const goal = await transaction.goal.findUnique({
        where: { id: current.id },
        select: goalSelection,
      });
      if (!goal) throw new DefinitivePlanningError();
      return { changed: true, goal };
    });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

async function setGoalWorkingStatus(
  input: GoalVersionInput,
  actor: ApplicationUser,
  expectedStatus: GoalStatus,
  nextStatus: GoalStatus,
): Promise<Readonly<{ changed: boolean; goal: GoalRecord }>> {
  const parsed = goalVersionInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (transaction) => {
      const access = await requireMutableRecordClient(
        transaction,
        actor,
        "GOAL",
        parsed.goalId,
      );
      const current = await transaction.goal.findFirst({
        where: {
          id: parsed.goalId,
          organisationId: access.actor.organisationId,
          clientId: access.clientId,
        },
        select: goalSelection,
      });
      if (!current) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitivePlanningError("STALE_VERSION");
      }
      if (current.status === nextStatus)
        return { changed: false, goal: current };
      if (current.status !== expectedStatus) {
        throw new DefinitivePlanningError("INVALID_STATE");
      }
      const updated = await transaction.goal.updateMany({
        where: {
          id: current.id,
          organisationId: access.actor.organisationId,
          status: expectedStatus,
          version: parsed.expectedVersion,
        },
        data: { status: nextStatus, version: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new DefinitivePlanningError("STALE_VERSION");
      const goal = await transaction.goal.findUnique({
        where: { id: current.id },
        select: goalSelection,
      });
      if (!goal) throw new DefinitivePlanningError();
      return { changed: true, goal };
    });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

export function pauseGoalInternal(
  input: GoalVersionInput,
  actor: ApplicationUser,
) {
  return setGoalWorkingStatus(
    input,
    actor,
    GoalStatus.ACTIVE,
    GoalStatus.PAUSED,
  );
}

export function resumeGoalInternal(
  input: GoalVersionInput,
  actor: ApplicationUser,
) {
  return setGoalWorkingStatus(
    input,
    actor,
    GoalStatus.PAUSED,
    GoalStatus.ACTIVE,
  );
}

async function verifyGoalTransition(
  intent: AuditIntentHandle,
  actor: ApplicationUser,
  clientId: string,
  goalId: string,
  expectedVersion: number,
  status: "COMPLETED" | "ARCHIVED",
): Promise<PlanningAuditTransactionVerification<GoalRecord>> {
  return prisma.$transaction(async (transaction) => {
    await lockClientForMutation(transaction, clientId);
    const goal = await transaction.goal.findFirst({
      where: { id: goalId, organisationId: actor.organisationId, clientId },
      select: goalSelection,
    });
    const outcome = await transaction.auditEvent.findUnique({
      where: {
        operationId_type: { operationId: intent.operationId, type: "OUTCOME" },
      },
      select: { result: true, resolvedTargetId: true },
    });
    if (!goal) return { state: "UNKNOWN" };
    const actorMatches =
      status === GoalStatus.COMPLETED
        ? goal?.completedByUser?.id === actor.userId
        : goal?.archivedByUser?.id === actor.userId;
    if (
      goal.status === status &&
      goal.version === expectedVersion + 1 &&
      actorMatches &&
      outcome?.result === "SUCCEEDED" &&
      outcome.resolvedTargetId === goalId
    ) {
      return { state: "COMPLETED", value: goal };
    }
    if (
      (goal.status === GoalStatus.ACTIVE ||
        goal.status === GoalStatus.PAUSED) &&
      goal.version === expectedVersion &&
      !outcome
    ) {
      return { state: "ROLLED_BACK" };
    }
    return { state: "UNKNOWN" };
  });
}

async function transitionGoalTerminal(
  input: AuditedGoalTransitionInput,
  actor: ApplicationUser,
  status: "COMPLETED" | "ARCHIVED",
  testDependencies?: PlanningTestDependencies,
): Promise<GoalRecord> {
  const parsed = auditedGoalTransitionInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  let preflightActor: ApplicationUser;
  let clientId: string;
  try {
    const preflight = await prisma.$transaction(async (transaction) => {
      const access = await requireMutableRecordClient(
        transaction,
        actor,
        "GOAL",
        parsed.goalId,
      );
      const goal = await transaction.goal.findFirst({
        where: {
          id: parsed.goalId,
          organisationId: access.actor.organisationId,
        },
        select: { status: true, version: true },
      });
      if (!goal) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      if (
        goal.status !== GoalStatus.ACTIVE &&
        goal.status !== GoalStatus.PAUSED
      ) {
        throw new DefinitivePlanningError("INVALID_STATE");
      }
      if (goal.version !== parsed.expectedVersion) {
        throw new DefinitivePlanningError("STALE_VERSION");
      }
      return { actor: access.actor, clientId: access.clientId };
    });
    preflightActor = preflight.actor;
    clientId = preflight.clientId;
  } catch (error) {
    return throwPublicPlanningError(error);
  }

  const action: AuditAction =
    status === GoalStatus.COMPLETED ? "GOAL_COMPLETED" : "GOAL_ARCHIVED";
  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor: preflightActor,
    action,
    target: { targetId: parsed.goalId },
  });

  try {
    await dependencies.beforeBusinessTransaction?.();
  } catch (error) {
    return finishFailed(intent, error);
  }

  const result = await runPlanningAuditTransaction<
    Prisma.TransactionClient,
    GoalRecord
  >(
    (callback) => prisma.$transaction(callback),
    async (transaction) => {
      await lockClientForMutation(transaction, clientId);
      const currentActor = await requireClient(
        transaction,
        actor,
        clientId,
        "WORK",
      );
      const current = await transaction.goal.findFirst({
        where: {
          id: parsed.goalId,
          organisationId: currentActor.organisationId,
          clientId,
        },
        select: { status: true, version: true },
      });
      if (!current) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      if (
        current.status !== GoalStatus.ACTIVE &&
        current.status !== GoalStatus.PAUSED
      ) {
        throw new DefinitivePlanningError("INVALID_STATE");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitivePlanningError("STALE_VERSION");
      }
      const occurredAt = new Date();
      const updated = await transaction.goal.updateMany({
        where: {
          id: parsed.goalId,
          organisationId: currentActor.organisationId,
          status: { in: [GoalStatus.ACTIVE, GoalStatus.PAUSED] },
          version: parsed.expectedVersion,
        },
        data:
          status === GoalStatus.COMPLETED
            ? {
                status,
                completedAt: occurredAt,
                completedByUserId: currentActor.userId,
                version: { increment: 1 },
              }
            : {
                status,
                archivedAt: occurredAt,
                archivedByUserId: currentActor.userId,
                version: { increment: 1 },
              },
      });
      if (updated.count !== 1)
        throw new DefinitivePlanningError("STALE_VERSION");
      await dependencies.afterBusinessMutation?.(transaction);
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        parsed.goalId,
      );
      const goal = await transaction.goal.findUnique({
        where: { id: parsed.goalId },
        select: goalSelection,
      });
      if (!goal || goal.status !== status) throw new DefinitivePlanningError();
      return goal;
    },
    () =>
      verifyGoalTransition(
        intent,
        preflightActor,
        clientId,
        parsed.goalId,
        parsed.expectedVersion,
        status,
      ),
  );
  if (result.state === "COMPLETED") return result.value;
  if (result.state === "ROLLED_BACK") return finishFailed(intent, result.error);
  return finishAmbiguous(intent);
}

export function completeGoalInternal(
  input: AuditedGoalTransitionInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  return transitionGoalTerminal(
    input,
    actor,
    GoalStatus.COMPLETED,
    dependencies,
  );
}

export function archiveGoalInternal(
  input: AuditedGoalTransitionInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  return transitionGoalTerminal(
    input,
    actor,
    GoalStatus.ARCHIVED,
    dependencies,
  );
}

export async function listFollowUpsInternal(
  input: ClientPlanningQueryInput,
  actor: ApplicationUser,
): Promise<readonly FollowUpRecord[]> {
  const parsed = clientPlanningQueryInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (transaction) => {
      const currentActor = await requireClient(
        transaction,
        actor,
        parsed.clientId,
        "READ",
      );
      const rows = await transaction.followUp.findMany({
        where: {
          organisationId: currentActor.organisationId,
          clientId: parsed.clientId,
          client: { is: getClientDetailAccessWhere(currentActor) },
        },
        orderBy: [
          { status: "asc" },
          { dueDate: "asc" },
          { dueTime: "asc" },
          { id: "asc" },
        ],
        select: followUpSelection,
      });
      return addResponsibilityState(
        transaction,
        currentActor.organisationId,
        parsed.clientId,
        rows,
      );
    });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

export async function getFollowUpInternal(
  input: FollowUpQueryInput,
  actor: ApplicationUser,
): Promise<FollowUpRecord> {
  const parsed = followUpQueryInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (transaction) => {
      const currentActor = await requireCurrentActor(transaction, actor);
      const row = await transaction.followUp.findFirst({
        where: {
          id: parsed.followUpId,
          organisationId: currentActor.organisationId,
          client: { is: getClientDetailAccessWhere(currentActor) },
        },
        select: followUpSelection,
      });
      if (!row) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      const [result] = await addResponsibilityState(
        transaction,
        currentActor.organisationId,
        row.clientId,
        [row],
      );
      if (!result) throw new DefinitivePlanningError();
      return result;
    });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

export async function listEligibleResponsibleUsersInternal(
  input: ClientPlanningQueryInput,
  actor: ApplicationUser,
): Promise<readonly EligibleResponsibleUser[]> {
  const parsed = clientPlanningQueryInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (transaction) => {
      const currentActor = await requireClient(
        transaction,
        actor,
        parsed.clientId,
        "WORK",
      );
      return eligibleResponsibleUsers(
        transaction,
        currentActor.organisationId,
        parsed.clientId,
      );
    });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

export async function createFollowUpInternal(
  input: CreateFollowUpInput,
  actor: ApplicationUser,
): Promise<FollowUpRecord> {
  const parsed = createFollowUpInputSchema.parse(input);
  try {
    return await prisma.$transaction(async (transaction) => {
      await lockClientForMutation(transaction, parsed.clientId);
      const currentActor = await requireClient(
        transaction,
        actor,
        parsed.clientId,
        "WORK",
      );
      await requireEligibleResponsibleUser(
        transaction,
        currentActor.organisationId,
        parsed.clientId,
        parsed.responsibleUserId,
      );
      await requireNewGoalLink(
        transaction,
        currentActor.organisationId,
        parsed.clientId,
        parsed.goalId,
      );
      const row = await transaction.followUp.create({
        data: {
          id: randomUUID(),
          organisationId: currentActor.organisationId,
          clientId: parsed.clientId,
          title: parsed.title,
          description: parsed.description,
          ...followUpDueValues(parsed.dueDate, parsed.dueTime),
          status: FollowUpStatus.PLANNED,
          goalId: parsed.goalId,
          createdByUserId: currentActor.userId,
          responsibleUserId: parsed.responsibleUserId,
          version: 1,
        },
        select: followUpSelection,
      });
      return { ...row, responsibilityNeedsReassignment: false };
    });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

export async function updateFollowUpInternal(
  input: UpdateFollowUpInput,
  actor: ApplicationUser,
  testDependencies?: PlanningTestDependencies,
): Promise<Readonly<{ changed: boolean; followUp: FollowUpRecord }>> {
  const parsed = updateFollowUpInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  const due = followUpDueValues(parsed.dueDate, parsed.dueTime);
  try {
    return await prisma.$transaction(async (transaction) => {
      const access = await requireMutableRecordClient(
        transaction,
        actor,
        "FOLLOW_UP",
        parsed.followUpId,
      );
      const current = await transaction.followUp.findFirst({
        where: {
          id: parsed.followUpId,
          organisationId: access.actor.organisationId,
          clientId: access.clientId,
        },
        select: followUpSelection,
      });
      if (!current) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      if (current.status !== FollowUpStatus.PLANNED) {
        throw new DefinitivePlanningError("INVALID_STATE");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitivePlanningError("STALE_VERSION");
      }
      if (current.goalId !== parsed.goalId) {
        await requireNewGoalLink(
          transaction,
          access.actor.organisationId,
          access.clientId,
          parsed.goalId,
        );
      }
      const changed =
        current.title !== parsed.title ||
        current.description !== parsed.description ||
        formatCalendarDate(current.dueDate) !==
          formatCalendarDate(due.dueDate) ||
        current.dueTime !== due.dueTime ||
        current.goalId !== parsed.goalId;
      if (!changed) {
        const [record] = await addResponsibilityState(
          transaction,
          access.actor.organisationId,
          access.clientId,
          [current],
        );
        if (!record) throw new DefinitivePlanningError();
        return { changed: false, followUp: record };
      }
      const updated = await transaction.followUp.updateMany({
        where: {
          id: current.id,
          organisationId: access.actor.organisationId,
          status: FollowUpStatus.PLANNED,
          version: parsed.expectedVersion,
        },
        data: {
          title: parsed.title,
          description: parsed.description,
          ...due,
          goalId: parsed.goalId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new DefinitivePlanningError("STALE_VERSION");
      await dependencies.afterBusinessMutation?.(transaction);
      const row = await transaction.followUp.findUnique({
        where: { id: current.id },
        select: followUpSelection,
      });
      if (!row) throw new DefinitivePlanningError();
      const [record] = await addResponsibilityState(
        transaction,
        access.actor.organisationId,
        access.clientId,
        [row],
      );
      if (!record) throw new DefinitivePlanningError();
      return { changed: true, followUp: record };
    });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}

async function verifyFollowUpTransition(
  intent: AuditIntentHandle,
  actor: ApplicationUser,
  clientId: string,
  followUpId: string,
  expectedVersion: number,
  action: Extract<
    AuditAction,
    "FOLLOW_UP_REASSIGNED" | "FOLLOW_UP_COMPLETED" | "FOLLOW_UP_CANCELLED"
  >,
  newResponsibleUserId?: string,
): Promise<PlanningAuditTransactionVerification<FollowUpRecord>> {
  return prisma.$transaction(async (transaction) => {
    await lockClientForMutation(transaction, clientId);
    const row = await transaction.followUp.findFirst({
      where: { id: followUpId, organisationId: actor.organisationId, clientId },
      select: followUpSelection,
    });
    const outcome = await transaction.auditEvent.findUnique({
      where: {
        operationId_type: { operationId: intent.operationId, type: "OUTCOME" },
      },
      select: { result: true, resolvedTargetId: true },
    });
    const reassignmentHistory =
      action === "FOLLOW_UP_REASSIGNED"
        ? await transaction.followUpResponsibilityHistory.findUnique({
            where: { auditOperationId: intent.operationId },
            select: {
              followUpId: true,
              followUpVersion: true,
              newResponsibleUserId: true,
              actorUserId: true,
            },
          })
        : null;
    if (!row) return { state: "UNKNOWN" };
    const businessComplete =
      row.version === expectedVersion + 1 &&
      (action === "FOLLOW_UP_REASSIGNED"
        ? row.status === FollowUpStatus.PLANNED &&
          row.responsibleUser.id === newResponsibleUserId &&
          reassignmentHistory?.followUpId === row.id &&
          reassignmentHistory.followUpVersion === row.version &&
          reassignmentHistory.newResponsibleUserId === newResponsibleUserId &&
          reassignmentHistory.actorUserId === actor.userId
        : action === "FOLLOW_UP_COMPLETED"
          ? row.status === FollowUpStatus.COMPLETED &&
            row.completedByUser?.id === actor.userId
          : row.status === FollowUpStatus.CANCELLED &&
            row.cancelledByUser?.id === actor.userId);
    if (
      !businessComplete ||
      outcome?.result !== "SUCCEEDED" ||
      outcome.resolvedTargetId !== followUpId
    ) {
      if (
        row.status === FollowUpStatus.PLANNED &&
        row.version === expectedVersion &&
        !outcome
      ) {
        return { state: "ROLLED_BACK" };
      }
      return { state: "UNKNOWN" };
    }
    const [record] = await addResponsibilityState(
      transaction,
      actor.organisationId,
      clientId,
      [row],
    );
    return record
      ? { state: "COMPLETED", value: record }
      : { state: "UNKNOWN" };
  });
}

export async function reassignFollowUpInternal(
  input: ReassignFollowUpInput,
  actor: ApplicationUser,
  testDependencies?: PlanningTestDependencies,
): Promise<Readonly<{ changed: boolean; followUp: FollowUpRecord }>> {
  const parsed = reassignFollowUpInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  let preflightActor: ApplicationUser;
  let clientId: string;
  try {
    const preflight = await prisma.$transaction(async (transaction) => {
      const access = await requireMutableRecordClient(
        transaction,
        actor,
        "FOLLOW_UP",
        parsed.followUpId,
      );
      const current = await transaction.followUp.findFirst({
        where: {
          id: parsed.followUpId,
          organisationId: access.actor.organisationId,
        },
        select: followUpSelection,
      });
      if (!current) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      if (current.status !== FollowUpStatus.PLANNED) {
        throw new DefinitivePlanningError("INVALID_STATE");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitivePlanningError("STALE_VERSION");
      }
      if (current.responsibleUser.id === parsed.responsibleUserId) {
        const [record] = await addResponsibilityState(
          transaction,
          access.actor.organisationId,
          access.clientId,
          [current],
        );
        if (!record) throw new DefinitivePlanningError();
        return {
          actor: access.actor,
          clientId: access.clientId,
          noChange: record,
        };
      }
      await requireEligibleResponsibleUser(
        transaction,
        access.actor.organisationId,
        access.clientId,
        parsed.responsibleUserId,
      );
      return { actor: access.actor, clientId: access.clientId, noChange: null };
    });
    if (preflight.noChange)
      return { changed: false, followUp: preflight.noChange };
    preflightActor = preflight.actor;
    clientId = preflight.clientId;
  } catch (error) {
    return throwPublicPlanningError(error);
  }

  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor: preflightActor,
    action: "FOLLOW_UP_REASSIGNED",
    target: { targetId: parsed.followUpId },
  });
  try {
    await dependencies.beforeBusinessTransaction?.();
  } catch (error) {
    return finishFailed(intent, error);
  }

  const result = await runPlanningAuditTransaction<
    Prisma.TransactionClient,
    FollowUpRecord
  >(
    (callback) => prisma.$transaction(callback),
    async (transaction) => {
      await lockClientForMutation(transaction, clientId);
      const currentActor = await requireClient(
        transaction,
        actor,
        clientId,
        "WORK",
      );
      const current = await transaction.followUp.findFirst({
        where: {
          id: parsed.followUpId,
          organisationId: currentActor.organisationId,
          clientId,
        },
        select: { status: true, version: true, responsibleUserId: true },
      });
      if (!current) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      if (current.status !== FollowUpStatus.PLANNED) {
        throw new DefinitivePlanningError("INVALID_STATE");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitivePlanningError("STALE_VERSION");
      }
      if (current.responsibleUserId === parsed.responsibleUserId) {
        throw new DefinitivePlanningError("NO_CHANGES");
      }
      await requireEligibleResponsibleUser(
        transaction,
        currentActor.organisationId,
        clientId,
        parsed.responsibleUserId,
      );
      await transaction.$executeRaw`
        SELECT set_config(
          'kaul.follow_up_reassignment_operation_id',
          ${intent.operationId},
          true
        )
      `;
      const updated = await transaction.followUp.updateMany({
        where: {
          id: parsed.followUpId,
          organisationId: currentActor.organisationId,
          status: FollowUpStatus.PLANNED,
          version: parsed.expectedVersion,
          responsibleUserId: current.responsibleUserId,
        },
        data: {
          responsibleUserId: parsed.responsibleUserId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new DefinitivePlanningError("STALE_VERSION");
      await transaction.$executeRaw`
        SELECT set_config(
          'kaul.follow_up_reassignment_operation_id',
          '',
          true
        )
      `;
      await dependencies.afterBusinessMutation?.(transaction);
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        parsed.followUpId,
      );
      const row = await transaction.followUp.findUnique({
        where: { id: parsed.followUpId },
        select: followUpSelection,
      });
      if (!row) throw new DefinitivePlanningError();
      const [record] = await addResponsibilityState(
        transaction,
        currentActor.organisationId,
        clientId,
        [row],
      );
      if (!record) throw new DefinitivePlanningError();
      return record;
    },
    () =>
      verifyFollowUpTransition(
        intent,
        preflightActor,
        clientId,
        parsed.followUpId,
        parsed.expectedVersion,
        "FOLLOW_UP_REASSIGNED",
        parsed.responsibleUserId,
      ),
  );
  if (result.state === "COMPLETED")
    return { changed: true, followUp: result.value };
  if (result.state === "ROLLED_BACK") return finishFailed(intent, result.error);
  return finishAmbiguous(intent);
}

async function transitionFollowUpTerminal(
  input: AuditedFollowUpTransitionInput,
  actor: ApplicationUser,
  status: "COMPLETED" | "CANCELLED",
  testDependencies?: PlanningTestDependencies,
): Promise<FollowUpRecord> {
  const parsed = auditedFollowUpTransitionInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  let preflightActor: ApplicationUser;
  let clientId: string;
  try {
    const preflight = await prisma.$transaction(async (transaction) => {
      const access = await requireMutableRecordClient(
        transaction,
        actor,
        "FOLLOW_UP",
        parsed.followUpId,
      );
      const row = await transaction.followUp.findFirst({
        where: {
          id: parsed.followUpId,
          organisationId: access.actor.organisationId,
        },
        select: { status: true, version: true },
      });
      if (!row) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      if (row.status !== FollowUpStatus.PLANNED) {
        throw new DefinitivePlanningError("INVALID_STATE");
      }
      if (row.version !== parsed.expectedVersion) {
        throw new DefinitivePlanningError("STALE_VERSION");
      }
      return { actor: access.actor, clientId: access.clientId };
    });
    preflightActor = preflight.actor;
    clientId = preflight.clientId;
  } catch (error) {
    return throwPublicPlanningError(error);
  }
  const action: Extract<
    AuditAction,
    "FOLLOW_UP_COMPLETED" | "FOLLOW_UP_CANCELLED"
  > =
    status === FollowUpStatus.COMPLETED
      ? "FOLLOW_UP_COMPLETED"
      : "FOLLOW_UP_CANCELLED";
  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor: preflightActor,
    action,
    target: { targetId: parsed.followUpId },
  });
  try {
    await dependencies.beforeBusinessTransaction?.();
  } catch (error) {
    return finishFailed(intent, error);
  }
  const result = await runPlanningAuditTransaction<
    Prisma.TransactionClient,
    FollowUpRecord
  >(
    (callback) => prisma.$transaction(callback),
    async (transaction) => {
      await lockClientForMutation(transaction, clientId);
      const currentActor = await requireClient(
        transaction,
        actor,
        clientId,
        "WORK",
      );
      const current = await transaction.followUp.findFirst({
        where: {
          id: parsed.followUpId,
          organisationId: currentActor.organisationId,
          clientId,
        },
        select: { status: true, version: true },
      });
      if (!current) throw new DefinitivePlanningError("TARGET_UNAVAILABLE");
      if (current.status !== FollowUpStatus.PLANNED) {
        throw new DefinitivePlanningError("INVALID_STATE");
      }
      if (current.version !== parsed.expectedVersion) {
        throw new DefinitivePlanningError("STALE_VERSION");
      }
      const occurredAt = new Date();
      const updated = await transaction.followUp.updateMany({
        where: {
          id: parsed.followUpId,
          organisationId: currentActor.organisationId,
          status: FollowUpStatus.PLANNED,
          version: parsed.expectedVersion,
        },
        data:
          status === FollowUpStatus.COMPLETED
            ? {
                status,
                completedAt: occurredAt,
                completedByUserId: currentActor.userId,
                version: { increment: 1 },
              }
            : {
                status,
                cancelledAt: occurredAt,
                cancelledByUserId: currentActor.userId,
                version: { increment: 1 },
              },
      });
      if (updated.count !== 1)
        throw new DefinitivePlanningError("STALE_VERSION");
      await dependencies.afterBusinessMutation?.(transaction);
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        parsed.followUpId,
      );
      const row = await transaction.followUp.findUnique({
        where: { id: parsed.followUpId },
        select: followUpSelection,
      });
      if (!row || row.status !== status) throw new DefinitivePlanningError();
      const [record] = await addResponsibilityState(
        transaction,
        currentActor.organisationId,
        clientId,
        [row],
      );
      if (!record) throw new DefinitivePlanningError();
      return record;
    },
    () =>
      verifyFollowUpTransition(
        intent,
        preflightActor,
        clientId,
        parsed.followUpId,
        parsed.expectedVersion,
        action,
      ),
  );
  if (result.state === "COMPLETED") return result.value;
  if (result.state === "ROLLED_BACK") return finishFailed(intent, result.error);
  return finishAmbiguous(intent);
}

export function completeFollowUpInternal(
  input: AuditedFollowUpTransitionInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  return transitionFollowUpTerminal(
    input,
    actor,
    FollowUpStatus.COMPLETED,
    dependencies,
  );
}

export function cancelFollowUpInternal(
  input: AuditedFollowUpTransitionInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  return transitionFollowUpTerminal(
    input,
    actor,
    FollowUpStatus.CANCELLED,
    dependencies,
  );
}

export async function listOwnFollowUpsForHomeInternal(
  actor: ApplicationUser,
  now: Date = new Date(),
): Promise<readonly OwnFollowUpHomeItem[]> {
  try {
    const currentActor = await requireCurrentActor(prisma, actor);
    const today = formatStockholmCalendarDate(now);
    const endDate = requiredCalendarDate(addCalendarDays(today, 7));
    const rows = await prisma.followUp.findMany({
      where: {
        organisationId: currentActor.organisationId,
        responsibleUserId: currentActor.userId,
        status: FollowUpStatus.PLANNED,
        dueDate: { lte: endDate },
        client: { is: getOrdinaryClientAccessWhere(currentActor) },
      },
      select: {
        id: true,
        clientId: true,
        title: true,
        dueDate: true,
        dueTime: true,
        dueAt: true,
        client: { select: { firstName: true, lastName: true } },
        goal: { select: { id: true, title: true } },
      },
    });
    const groupRank = { OVERDUE: 0, DUE_TODAY: 1, UPCOMING: 2 } as const;
    return rows
      .flatMap((row) => {
        const dueState = getFollowUpDueState(row, now);
        return dueState === "OUTSIDE_WINDOW"
          ? []
          : [
              {
                id: row.id,
                clientId: row.clientId,
                clientFirstName: row.client.firstName,
                clientLastName: row.client.lastName,
                title: row.title,
                dueDate: row.dueDate,
                dueTime: row.dueTime,
                dueAt: row.dueAt,
                dueState,
                goal: row.goal,
              } satisfies OwnFollowUpHomeItem,
            ];
      })
      .sort((left, right) => {
        const group = groupRank[left.dueState] - groupRank[right.dueState];
        if (group !== 0) return group;
        const date = formatCalendarDate(left.dueDate).localeCompare(
          formatCalendarDate(right.dueDate),
        );
        if (date !== 0) return left.dueState === "OVERDUE" ? -date : date;
        const time = (left.dueTime ?? "24:00").localeCompare(
          right.dueTime ?? "24:00",
        );
        if (time !== 0) return left.dueState === "OVERDUE" ? -time : time;
        return left.id.localeCompare(right.id);
      });
  } catch (error) {
    return throwPublicPlanningError(error);
  }
}
