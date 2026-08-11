import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  ApplicationUser,
  AuthenticatedUser,
} from "../authentication/guards";
import {
  auditActionSchema,
  auditIntentContextSchema,
  auditHistoricalIdentifierSchema,
  auditOperationIdSchema,
  getAuditActionPolicy,
  type AuditAction,
  type AuditIntentContext,
} from "./audit-vocabulary";
import { throwIfPasswordChangedIntentPersistenceMustFail } from "./audit-test-state";

const AUDIT_ERROR_MESSAGE = "Audit requirement not satisfied.";
const auditIntentHandleBrand: unique symbol = Symbol("AuditIntentHandle");
const auditUniqueCollision = Symbol("AuditUniqueCollision");

export type AuditErrorCode =
  | "INVALID_INPUT"
  | "INTENT_PERSISTENCE_FAILED"
  | "OPERATION_REQUIRES_REVIEW"
  | "INCONSISTENT_OPERATION"
  | "OUTCOME_PERSISTENCE_FAILED"
  | "RECOVERY_ALREADY_RECORDED";

export class AuditError extends Error {
  readonly code: AuditErrorCode;
  readonly operationId?: string;

  constructor(code: AuditErrorCode, operationId?: string) {
    super(AUDIT_ERROR_MESSAGE);
    Object.defineProperty(this, "name", {
      value: "AuditError",
      configurable: true,
    });
    this.code = code;
    this.operationId = operationId;
  }
}

export type AuditIntentHandle = Readonly<{
  operationId: string;
  [auditIntentHandleBrand]: true;
}>;

type AuditDatabaseClient = Pick<
  Prisma.TransactionClient,
  "auditOperation" | "auditEvent" | "user"
>;

type AuditOutcomeDatabaseClient = Pick<
  Prisma.TransactionClient,
  "auditOperation" | "auditEvent"
>;

type AuditTargetInput = Readonly<{ targetId?: string | null }>;

type UserAuditIntentInput = Readonly<{
  operationId: string;
  actor: ApplicationUser;
  action: AuditAction;
  target?: AuditTargetInput;
}>;

type SystemAuditIntentInput = Readonly<{
  operationId: string;
  organisationId?: string | null;
  action: AuditAction;
  target?: AuditTargetInput;
}>;

type UnauthenticatedAuditIntentInput = Readonly<{
  operationId: string;
  action: AuditAction;
}>;

type PasswordChangedAuditIntentInput = Readonly<{
  operationId: string;
  actor: Pick<AuthenticatedUser, "userId" | "organisationId">;
}>;

type LoginSucceededAuditIntentInput = Readonly<{
  operationId: string;
  actor: Pick<AuthenticatedUser, "userId" | "organisationId">;
}>;

const loginSucceededAuditIntentInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    actor: z
      .object({
        userId: auditHistoricalIdentifierSchema,
        organisationId: auditHistoricalIdentifierSchema,
      })
      .strict(),
  })
  .strict();

const unauthenticatedAuditIntentInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    action: auditActionSchema,
  })
  .strict();

type AuditOutcomeResult = "SUCCEEDED" | "FAILED" | "AMBIGUOUS";
type AuditRecoveryResult = Exclude<AuditOutcomeResult, "AMBIGUOUS">;

function parseOutcomeResult(result: unknown): AuditOutcomeResult {
  if (result !== "SUCCEEDED" && result !== "FAILED" && result !== "AMBIGUOUS") {
    throw new AuditError("INVALID_INPUT");
  }

  return result;
}

function parseRecoveryResult(result: unknown): AuditRecoveryResult {
  if (result !== "SUCCEEDED" && result !== "FAILED") {
    throw new AuditError("INVALID_INPUT");
  }

  return result;
}

function createIntentHandle(operationId: string): AuditIntentHandle {
  return {
    operationId,
    [auditIntentHandleBrand]: true,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

type PersistedIntentContext = Readonly<{
  id: string;
  organisationId: string | null;
  actorKind: "USER" | "SYSTEM" | "UNAUTHENTICATED";
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
}>;

function sameIntentContext(
  existing: PersistedIntentContext,
  requested: AuditIntentContext,
): boolean {
  return (
    existing.id === requested.operationId &&
    existing.organisationId === requested.organisationId &&
    existing.actorKind === requested.actorKind &&
    existing.actorUserId === requested.actorUserId &&
    existing.action === requested.action &&
    existing.targetType === requested.targetType &&
    existing.targetId === requested.targetId
  );
}

function classifyIntentCollision(
  existing: PersistedIntentContext,
  requested: AuditIntentContext,
): never {
  throw new AuditError(
    sameIntentContext(existing, requested)
      ? "OPERATION_REQUIRES_REVIEW"
      : "INCONSISTENT_OPERATION",
    requested.operationId,
  );
}

async function classifyCommittedIntentCollision(
  requested: AuditIntentContext,
): Promise<never> {
  try {
    const existing = await prisma.auditOperation.findUnique({
      where: { id: requested.operationId },
      select: {
        id: true,
        organisationId: true,
        actorKind: true,
        actorUserId: true,
        action: true,
        targetType: true,
        targetId: true,
      },
    });

    if (!existing) {
      throw new AuditError("INTENT_PERSISTENCE_FAILED", requested.operationId);
    }

    classifyIntentCollision(existing, requested);
  } catch (error) {
    if (error instanceof AuditError) {
      throw error;
    }

    throw new AuditError("INTENT_PERSISTENCE_FAILED", requested.operationId);
  }
}

async function persistCommittedAuditIntent(
  context: AuditIntentContext,
  persist: () => Promise<AuditIntentHandle>,
): Promise<AuditIntentHandle> {
  try {
    return await persist();
  } catch (error) {
    if (error === auditUniqueCollision) {
      return classifyCommittedIntentCollision(context);
    }

    if (error instanceof AuditError) {
      throw error;
    }

    throw new AuditError("INTENT_PERSISTENCE_FAILED", context.operationId);
  }
}

function parseIntentContext(input: unknown): AuditIntentContext {
  const parsed = auditIntentContextSchema.safeParse(input);

  if (!parsed.success) {
    throw new AuditError("INVALID_INPUT");
  }

  return parsed.data;
}

async function persistAuditIntent(
  database: AuditDatabaseClient,
  context: AuditIntentContext,
): Promise<AuditIntentHandle> {
  const existing = await database.auditOperation.findUnique({
    where: { id: context.operationId },
    select: {
      id: true,
      organisationId: true,
      actorKind: true,
      actorUserId: true,
      action: true,
      targetType: true,
      targetId: true,
    },
  });

  if (existing) {
    classifyIntentCollision(existing, context);
  }

  try {
    await database.auditOperation.create({
      data: {
        id: context.operationId,
        organisationId: context.organisationId,
        actorKind: context.actorKind,
        actorUserId: context.actorUserId,
        action: context.action,
        targetType: context.targetType,
        targetId: context.targetId,
      },
    });
    throwIfPasswordChangedIntentPersistenceMustFail(
      context.action,
      context.operationId,
    );
    return createIntentHandle(context.operationId);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // The winning transaction is reloaded outside any failed transaction so
      // the collision can be classified from committed immutable context.
      throw auditUniqueCollision;
    }

    if (error instanceof AuditError) {
      throw error;
    }

    throw new AuditError("INTENT_PERSISTENCE_FAILED", context.operationId);
  }
}

function buildIntentContext(options: {
  operationId: string;
  organisationId: string | null;
  actorKind: "USER" | "SYSTEM" | "UNAUTHENTICATED";
  actorUserId: string | null;
  action: AuditAction;
  targetId?: string | null;
}): AuditIntentContext {
  const policy = getAuditActionPolicy(options.action);

  return parseIntentContext({
    operationId: options.operationId,
    organisationId: options.organisationId,
    actorKind: options.actorKind,
    actorUserId: options.actorUserId,
    action: options.action,
    targetType: policy.targetType,
    targetId: options.targetId ?? null,
  });
}

async function loadOperation(
  database: AuditOutcomeDatabaseClient,
  operationId: string,
) {
  const parsedOperationId = auditOperationIdSchema.safeParse(operationId);

  if (!parsedOperationId.success) {
    throw new AuditError("INVALID_INPUT");
  }

  const operation = await database.auditOperation.findUnique({
    where: { id: parsedOperationId.data },
    select: {
      id: true,
      action: true,
      targetId: true,
    },
  });

  if (!operation) {
    throw new AuditError("INCONSISTENT_OPERATION", parsedOperationId.data);
  }

  return operation;
}

function resolveOutcomeTarget(
  operation: { action: string; targetId: string | null },
  result: AuditOutcomeResult,
  resolvedTargetId?: string | null,
): string | null {
  const candidate = resolvedTargetId ?? operation.targetId;
  if (candidate !== null) {
    const parsed = auditHistoricalIdentifierSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new AuditError("INVALID_INPUT");
    }
  }

  if (
    operation.targetId !== null &&
    resolvedTargetId !== undefined &&
    resolvedTargetId !== null &&
    resolvedTargetId !== operation.targetId
  ) {
    throw new AuditError("INCONSISTENT_OPERATION");
  }

  const policy = getAuditActionPolicy(operation.action as AuditAction);
  if (policy.targetId === "FORBIDDEN" && resolvedTargetId != null) {
    throw new AuditError("INVALID_INPUT");
  }
  if (
    result === "SUCCEEDED" &&
    "resolvedTargetIdRequiredOnSuccess" in policy &&
    policy.resolvedTargetIdRequiredOnSuccess &&
    candidate === null
  ) {
    throw new AuditError("INVALID_INPUT");
  }

  return candidate;
}

export async function requireOldestUnresolvedInitialAdminOperation(
  transaction: AuditOutcomeDatabaseClient,
  operationId: string,
): Promise<void> {
  const parsedOperationId = auditOperationIdSchema.safeParse(operationId);
  if (!parsedOperationId.success) throw new AuditError("INVALID_INPUT");

  const oldest = await transaction.auditOperation.findFirst({
    where: {
      actorKind: "SYSTEM",
      action: "INITIAL_ADMIN_CREATED",
      targetType: "ORGANISATION",
      events: { none: {} },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  if (!oldest || oldest.id !== parsedOperationId.data) {
    throw new AuditError(
      "OPERATION_REQUIRES_REVIEW",
      oldest?.id ?? operationId,
    );
  }
}

export async function recordReviewedInitialAdminFailureInTransaction(
  transaction: AuditOutcomeDatabaseClient,
  operationId: string,
): Promise<void> {
  const parsedOperationId = auditOperationIdSchema.safeParse(operationId);
  if (!parsedOperationId.success) throw new AuditError("INVALID_INPUT");

  const operation = await transaction.auditOperation.findUnique({
    where: { id: parsedOperationId.data },
    select: {
      id: true,
      organisationId: true,
      actorKind: true,
      action: true,
      targetType: true,
      targetId: true,
      events: { select: { id: true }, take: 1 },
    },
  });
  if (
    !operation ||
    operation.actorKind !== "SYSTEM" ||
    operation.action !== "INITIAL_ADMIN_CREATED" ||
    operation.targetType !== "ORGANISATION" ||
    operation.organisationId === null ||
    operation.organisationId !== operation.targetId ||
    operation.events.length !== 0
  ) {
    throw new AuditError("INCONSISTENT_OPERATION", parsedOperationId.data);
  }

  await appendAuditEvent(
    transaction,
    createIntentHandle(operation.id),
    "OUTCOME",
    "FAILED",
  );
}

async function appendAuditEvent(
  database: AuditOutcomeDatabaseClient,
  handle: AuditIntentHandle,
  type: "OUTCOME" | "RECOVERY",
  result: AuditOutcomeResult,
  resolvedTargetId?: string | null,
): Promise<void> {
  const operation = await loadOperation(database, handle.operationId);
  const targetId = resolveOutcomeTarget(operation, result, resolvedTargetId);
  const outcome =
    type === "RECOVERY"
      ? await database.auditEvent.findUnique({
          where: {
            operationId_type: {
              operationId: operation.id,
              type: "OUTCOME",
            },
          },
          select: { result: true, resolvedTargetId: true },
        })
      : null;

  if (type === "RECOVERY" && outcome?.result !== "AMBIGUOUS") {
    throw new AuditError("INCONSISTENT_OPERATION", operation.id);
  }

  if (
    type === "RECOVERY" &&
    outcome?.resolvedTargetId !== null &&
    outcome?.resolvedTargetId !== targetId
  ) {
    throw new AuditError("INCONSISTENT_OPERATION", operation.id);
  }
  const existing = await database.auditEvent.findUnique({
    where: {
      operationId_type: {
        operationId: operation.id,
        type,
      },
    },
    select: { result: true, resolvedTargetId: true },
  });

  if (existing) {
    classifyAuditEventCollision(existing, type, result, targetId, operation.id);
  }

  try {
    await database.auditEvent.create({
      data: {
        operationId: operation.id,
        type,
        result,
        resolvedTargetId: targetId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return classifyCommittedAuditEventCollision(
        operation.id,
        type,
        result,
        targetId,
      );
    }

    if (error instanceof AuditError) {
      throw error;
    }

    throw new AuditError("OUTCOME_PERSISTENCE_FAILED", operation.id);
  }
}

function classifyAuditEventCollision(
  existing: { result: AuditOutcomeResult; resolvedTargetId: string | null },
  type: "OUTCOME" | "RECOVERY",
  attemptedResult: AuditOutcomeResult,
  attemptedTargetId: string | null,
  operationId: string,
): never {
  if (
    existing.result !== attemptedResult ||
    existing.resolvedTargetId !== attemptedTargetId
  ) {
    throw new AuditError("INCONSISTENT_OPERATION", operationId);
  }

  throw new AuditError(
    type === "RECOVERY"
      ? "RECOVERY_ALREADY_RECORDED"
      : "OPERATION_REQUIRES_REVIEW",
    operationId,
  );
}

async function classifyCommittedAuditEventCollision(
  operationId: string,
  type: "OUTCOME" | "RECOVERY",
  attemptedResult: AuditOutcomeResult,
  attemptedTargetId: string | null,
): Promise<never> {
  try {
    const existing = await prisma.auditEvent.findUnique({
      where: { operationId_type: { operationId, type } },
      select: { result: true, resolvedTargetId: true },
    });

    if (!existing) {
      throw new AuditError("OUTCOME_PERSISTENCE_FAILED", operationId);
    }

    classifyAuditEventCollision(
      existing,
      type,
      attemptedResult,
      attemptedTargetId,
      operationId,
    );
  } catch (error) {
    if (error instanceof AuditError) {
      throw error;
    }

    throw new AuditError("OUTCOME_PERSISTENCE_FAILED", operationId);
  }
}

export function generateAuditOperationId(): string {
  return randomUUID();
}

export async function createUserAuditIntent(
  input: UserAuditIntentInput,
): Promise<AuditIntentHandle> {
  const context = buildIntentContext({
    operationId: input.operationId,
    organisationId: input.actor.organisationId,
    actorKind: "USER",
    actorUserId: input.actor.userId,
    action: input.action,
    targetId: input.target?.targetId,
  });

  return persistCommittedAuditIntent(context, () =>
    prisma.$transaction(async (transaction) => {
      const actor = await transaction.user.findFirst({
        where: {
          id: context.actorUserId ?? undefined,
          organisationId: context.organisationId ?? undefined,
        },
        select: { id: true },
      });

      if (!actor) {
        throw new AuditError("INCONSISTENT_OPERATION", context.operationId);
      }

      return persistAuditIntent(transaction, context);
    }),
  );
}

export async function createPasswordChangedAuditIntent(
  input: PasswordChangedAuditIntentInput,
): Promise<AuditIntentHandle> {
  const context = buildIntentContext({
    operationId: input.operationId,
    organisationId: input.actor.organisationId,
    actorKind: "USER",
    actorUserId: input.actor.userId,
    action: "PASSWORD_CHANGED",
    targetId: input.actor.userId,
  });

  return persistCommittedAuditIntent(context, () =>
    prisma.$transaction(async (transaction) => {
      const actor = await transaction.user.findFirst({
        where: {
          id: context.actorUserId ?? undefined,
          organisationId: context.organisationId ?? undefined,
        },
        select: { id: true },
      });

      if (!actor) {
        throw new AuditError("INCONSISTENT_OPERATION", context.operationId);
      }

      return persistAuditIntent(transaction, context);
    }),
  );
}

export async function createLoginSucceededAuditIntent(
  input: LoginSucceededAuditIntentInput,
): Promise<AuditIntentHandle> {
  const parsedInput = loginSucceededAuditIntentInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new AuditError("INVALID_INPUT");
  }

  const context = buildIntentContext({
    operationId: parsedInput.data.operationId,
    organisationId: parsedInput.data.actor.organisationId,
    actorKind: "USER",
    actorUserId: parsedInput.data.actor.userId,
    action: "LOGIN_SUCCEEDED",
    targetId: null,
  });

  return persistCommittedAuditIntent(context, () =>
    prisma.$transaction(async (transaction) => {
      const actor = await transaction.user.findFirst({
        where: {
          id: context.actorUserId ?? undefined,
          organisationId: context.organisationId ?? undefined,
          organisation: {
            is: { id: context.organisationId ?? undefined },
          },
        },
        select: { id: true },
      });

      if (!actor) {
        throw new AuditError("INCONSISTENT_OPERATION", context.operationId);
      }

      return persistAuditIntent(transaction, context);
    }),
  );
}

export function createSystemAuditIntent(
  input: SystemAuditIntentInput,
): Promise<AuditIntentHandle> {
  const context = buildIntentContext({
    operationId: input.operationId,
    organisationId: input.organisationId ?? null,
    actorKind: "SYSTEM",
    actorUserId: null,
    action: input.action,
    targetId: input.target?.targetId,
  });

  return persistCommittedAuditIntent(context, () =>
    persistAuditIntent(prisma, context),
  );
}

export function createUnauthenticatedAuditIntent(
  input: UnauthenticatedAuditIntentInput,
): Promise<AuditIntentHandle> {
  const parsedInput = unauthenticatedAuditIntentInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new AuditError("INVALID_INPUT");
  }

  const context = buildIntentContext({
    operationId: parsedInput.data.operationId,
    organisationId: null,
    actorKind: "UNAUTHENTICATED",
    actorUserId: null,
    action: parsedInput.data.action,
    targetId: null,
  });

  return persistCommittedAuditIntent(context, () =>
    persistAuditIntent(prisma, context),
  );
}

export function appendAuditOutcomeInTransaction(
  transaction: AuditOutcomeDatabaseClient,
  intent: AuditIntentHandle,
  result: AuditOutcomeResult,
  resolvedTargetId?: string | null,
): Promise<void> {
  return appendAuditEvent(
    transaction,
    intent,
    "OUTCOME",
    parseOutcomeResult(result),
    resolvedTargetId,
  );
}

export function recordFailedAuditOutcome(
  intent: AuditIntentHandle,
  resolvedTargetId?: string | null,
): Promise<void> {
  return appendAuditEvent(
    prisma,
    intent,
    "OUTCOME",
    "FAILED",
    resolvedTargetId,
  );
}

export function recordAmbiguousAuditOutcome(
  intent: AuditIntentHandle,
  resolvedTargetId?: string | null,
): Promise<void> {
  return appendAuditEvent(
    prisma,
    intent,
    "OUTCOME",
    "AMBIGUOUS",
    resolvedTargetId,
  );
}

export function recordAuditRecovery(
  operationId: string,
  result: AuditRecoveryResult,
  resolvedTargetId?: string | null,
): Promise<void> {
  return appendAuditEvent(
    prisma,
    createIntentHandle(operationId),
    "RECOVERY",
    parseRecoveryResult(result),
    resolvedTargetId,
  );
}
