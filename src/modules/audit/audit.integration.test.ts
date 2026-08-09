import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { ApplicationUser } from "../authentication/guards";
import { prisma } from "../../lib/prisma";
import {
  appendAuditOutcomeInTransaction,
  createSystemAuditIntent,
  createUnauthenticatedAuditIntent,
  createUserAuditIntent,
  generateAuditOperationId,
  recordAmbiguousAuditOutcome,
  recordAuditRecovery,
  recordFailedAuditOutcome,
} from "./audit";

const fixtureUserIds = new Set<string>();
const fixtureOrganisationIds = new Set<string>();

function plannedOrganisationId(): string {
  return `organisation-${randomUUID()}`;
}

async function createActor(): Promise<ApplicationUser> {
  const organisationId = plannedOrganisationId();
  const userId = randomUUID();
  fixtureOrganisationIds.add(organisationId);
  fixtureUserIds.add(userId);

  await prisma.organisation.create({
    data: { id: organisationId, name: "Fiktiv auditorganisation" },
  });
  await prisma.user.create({
    data: {
      id: userId,
      name: "Fiktiv Auditadministratör",
      email: `${randomUUID()}@example.test`,
      role: "ADMINISTRATOR",
      organisationId,
      professionalTitle: "Fiktiv verksamhetsansvarig",
      mustChangePassword: false,
    },
  });

  return {
    userId,
    name: "Fiktiv Auditadministratör",
    email: "audit-administrator@example.test",
    role: "ADMINISTRATOR",
    organisationId,
    organisationName: "Fiktiv auditorganisation",
    professionalTitle: "Fiktiv verksamhetsansvarig",
    mustChangePassword: false,
    credentialState: "APPLICATION_ALLOWED",
  };
}

async function createUserIntent(actor: ApplicationUser, operationId?: string) {
  return createUserAuditIntent({
    operationId: operationId ?? generateAuditOperationId(),
    actor,
    action: "ACCOUNT_DEACTIVATED",
    target: { targetId: randomUUID() },
  });
}

afterEach(async () => {
  if (fixtureUserIds.size > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: [...fixtureUserIds] } },
    });
  }
  if (fixtureOrganisationIds.size > 0) {
    await prisma.organisation.deleteMany({
      where: { id: { in: [...fixtureOrganisationIds] } },
    });
  }
  fixtureUserIds.clear();
  fixtureOrganisationIds.clear();
});

describe("audit intent durability with PostgreSQL", () => {
  it.each(["LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGOUT_SUCCEEDED"] as const)(
    "rejects a resolved target forbidden by %s without persisting an event",
    async (action) => {
      const intent =
        action === "LOGIN_FAILED"
          ? await createUnauthenticatedAuditIntent({
              operationId: generateAuditOperationId(),
              action,
            })
          : await createUserAuditIntent({
              operationId: generateAuditOperationId(),
              actor: await createActor(),
              action,
            });

      await expect(
        prisma.$transaction((transaction) =>
          appendAuditOutcomeInTransaction(
            transaction,
            intent,
            "SUCCEEDED",
            randomUUID(),
          ),
        ),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      await expect(
        prisma.auditEvent.count({ where: { operationId: intent.operationId } }),
      ).resolves.toBe(0);
    },
  );

  it("commits the intent before a simulated protected mutation begins", async () => {
    const actor = await createActor();
    const operationId = generateAuditOperationId();
    let mutationStarted = false;

    const intent = await createUserAuditIntent({
      operationId,
      actor,
      action: "ACCOUNT_DEACTIVATED",
      target: { targetId: randomUUID() },
    });
    const persistedBeforeMutation = await prisma.auditOperation.findUnique({
      where: { id: operationId },
    });
    mutationStarted = true;

    expect(intent.operationId).toBe(operationId);
    expect(persistedBeforeMutation).not.toBeNull();
    expect(mutationStarted).toBe(true);
  });

  it("does not begin a protected mutation when intent persistence fails", async () => {
    const actor = await createActor();
    const operationId = generateAuditOperationId();
    const targetId = randomUUID();
    const input = {
      operationId,
      actor,
      action: "ACCOUNT_DEACTIVATED" as const,
      target: { targetId },
    };
    let mutationStarted = false;

    await createUserAuditIntent(input);
    await expect(
      (async () => {
        await createUserAuditIntent(input);
        mutationStarted = true;
      })(),
    ).rejects.toMatchObject({ code: "OPERATION_REQUIRES_REVIEW" });

    expect(mutationStarted).toBe(false);
  });

  it("preserves intent and appends FAILED after a later mutation rollback", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);
    const originalTitle = actor.professionalTitle;

    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: actor.userId },
          data: { professionalTitle: "Fiktiv ändring som återställs" },
        });
        throw new Error("Deliberate definitive mutation failure");
      }),
    ).rejects.toThrow("Deliberate definitive mutation failure");

    await recordFailedAuditOutcome(intent);

    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { professionalTitle: true },
      }),
    ).resolves.toEqual({ professionalTitle: originalTitle });
    await expect(
      prisma.auditOperation.findUnique({ where: { id: intent.operationId } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.auditEvent.findUnique({
        where: {
          operationId_type: {
            operationId: intent.operationId,
            type: "OUTCOME",
          },
        },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("commits a mutation and SUCCEEDED outcome together without changing intent", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);
    const before = await prisma.auditOperation.findUniqueOrThrow({
      where: { id: intent.operationId },
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: actor.userId },
        data: { professionalTitle: "Fiktiv uppdaterad titel" },
      });
      await appendAuditOutcomeInTransaction(transaction, intent, "SUCCEEDED");
    });

    const after = await prisma.auditOperation.findUniqueOrThrow({
      where: { id: intent.operationId },
    });
    const outcome = await prisma.auditEvent.findUniqueOrThrow({
      where: {
        operationId_type: {
          operationId: intent.operationId,
          type: "OUTCOME",
        },
      },
    });

    expect(after).toEqual(before);
    expect(outcome.result).toBe("SUCCEEDED");
  });

  it("records one definitive recovery after an ambiguous outcome", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);

    await recordAmbiguousAuditOutcome(intent);
    await recordAuditRecovery(intent.operationId, "SUCCEEDED");

    await expect(
      prisma.auditEvent.findMany({
        where: { operationId: intent.operationId },
        orderBy: { occurredAt: "asc" },
        select: { type: true, result: true },
      }),
    ).resolves.toEqual([
      { type: "OUTCOME", result: "AMBIGUOUS" },
      { type: "RECOVERY", result: "SUCCEEDED" },
    ]);
  });

  it("refuses recovery when no ambiguous outcome exists", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);

    await expect(
      recordAuditRecovery(intent.operationId, "FAILED"),
    ).rejects.toMatchObject({ code: "INCONSISTENT_OPERATION" });
  });
});

describe("audit database constraints", () => {
  it("rejects RECOVERY with an AMBIGUOUS result at the database boundary", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);

    await expect(
      prisma.auditEvent.create({
        data: {
          operationId: intent.operationId,
          type: "RECOVERY",
          result: "AMBIGUOUS",
        },
      }),
    ).rejects.toThrow();
  });

  it.each([
    {
      actorKind: "USER" as const,
      actorUserId: null,
      organisationId: "organisation-1",
    },
    {
      actorKind: "USER" as const,
      actorUserId: "user-1",
      organisationId: null,
    },
    {
      actorKind: "SYSTEM" as const,
      actorUserId: "fake-user",
      organisationId: null,
    },
    {
      actorKind: "UNAUTHENTICATED" as const,
      actorUserId: "fake-user",
      organisationId: null,
    },
  ])("rejects impossible actor context %#", async (context) => {
    await expect(
      prisma.auditOperation.create({
        data: {
          id: randomUUID(),
          ...context,
          action: "LOGIN_FAILED",
          targetType: "AUTHENTICATION",
        },
      }),
    ).rejects.toThrow();
  });

  it("allows an unauthenticated intent with no organisation", async () => {
    const intent = await createUnauthenticatedAuditIntent({
      operationId: generateAuditOperationId(),
      action: "LOGIN_FAILED",
    });

    await expect(
      prisma.auditOperation.findUniqueOrThrow({
        where: { id: intent.operationId },
        select: {
          actorKind: true,
          actorUserId: true,
          organisationId: true,
        },
      }),
    ).resolves.toEqual({
      actorKind: "UNAUTHENTICATED",
      actorUserId: null,
      organisationId: null,
    });
  });

  it("rejects a user actor whose trusted user and organisation do not match", async () => {
    const actor = await createActor();

    await expect(
      createUserAuditIntent({
        operationId: generateAuditOperationId(),
        actor: { ...actor, organisationId: plannedOrganisationId() },
        action: "ACCOUNT_DEACTIVATED",
        target: { targetId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "INCONSISTENT_OPERATION" });
  });
});

describe("audit idempotency and append-only enforcement", () => {
  it("fails closed for exact and incompatible duplicate operation IDs", async () => {
    const operationId = generateAuditOperationId();
    const organisationId = plannedOrganisationId();
    const input = {
      operationId,
      organisationId,
      action: "INITIAL_ADMIN_CREATED" as const,
      target: { targetId: organisationId },
    };

    await createSystemAuditIntent(input);
    await expect(createSystemAuditIntent(input)).rejects.toMatchObject({
      code: "OPERATION_REQUIRES_REVIEW",
    });
    const differentOrganisationId = plannedOrganisationId();
    await expect(
      createSystemAuditIntent({
        ...input,
        organisationId: differentOrganisationId,
        target: { targetId: differentOrganisationId },
      }),
    ).rejects.toMatchObject({ code: "INCONSISTENT_OPERATION" });
    await prisma.auditEvent.create({
      data: {
        operationId,
        type: "OUTCOME",
        result: "FAILED",
        resolvedTargetId: organisationId,
      },
    });
  });

  it("fails closed for a duplicate authenticated-user operation", async () => {
    const actor = await createActor();
    const operationId = generateAuditOperationId();
    const targetId = randomUUID();
    const input = {
      operationId,
      actor,
      action: "ACCOUNT_DEACTIVATED" as const,
      target: { targetId },
    };

    await createUserAuditIntent(input);
    await expect(createUserAuditIntent(input)).rejects.toMatchObject({
      code: "OPERATION_REQUIRES_REVIEW",
    });
  });

  it("rejects duplicate and conflicting outcomes and recoveries", async () => {
    const actor = await createActor();
    const firstIntent = await createUserIntent(actor);
    await recordFailedAuditOutcome(firstIntent);
    await expect(recordFailedAuditOutcome(firstIntent)).rejects.toMatchObject({
      code: "OPERATION_REQUIRES_REVIEW",
    });
    await expect(
      prisma.$transaction((transaction) =>
        appendAuditOutcomeInTransaction(transaction, firstIntent, "SUCCEEDED"),
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_OPERATION" });

    const secondIntent = await createUserIntent(actor);
    await recordAmbiguousAuditOutcome(secondIntent);
    await recordAuditRecovery(secondIntent.operationId, "FAILED");
    await expect(
      recordAuditRecovery(secondIntent.operationId, "FAILED"),
    ).rejects.toMatchObject({ code: "RECOVERY_ALREADY_RECORDED" });
    await expect(
      recordAuditRecovery(secondIntent.operationId, "SUCCEEDED"),
    ).rejects.toMatchObject({ code: "INCONSISTENT_OPERATION" });
  });

  it("classifies concurrent exact AuditOperation creation as review-required", async () => {
    const operationId = generateAuditOperationId();
    const organisationId = plannedOrganisationId();
    const input = {
      operationId,
      organisationId,
      action: "INITIAL_ADMIN_CREATED" as const,
      target: { targetId: organisationId },
    };

    const results = await Promise.allSettled([
      createSystemAuditIntent(input),
      createSystemAuditIntent(input),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: "OPERATION_REQUIRES_REVIEW" }),
      }),
    ]);
    await expect(
      prisma.auditOperation.count({ where: { id: operationId } }),
    ).resolves.toBe(1);
    await prisma.auditEvent.create({
      data: {
        operationId,
        type: "OUTCOME",
        result: "FAILED",
        resolvedTargetId: organisationId,
      },
    });
  });

  it("classifies concurrent incompatible AuditOperation context from the committed winner", async () => {
    const operationId = generateAuditOperationId();
    const organisationIds = [plannedOrganisationId(), plannedOrganisationId()];
    const inputs = organisationIds.map((organisationId) => ({
      operationId,
      organisationId,
      action: "INITIAL_ADMIN_CREATED" as const,
      target: { targetId: organisationId },
    }));

    const results = await Promise.allSettled([
      createSystemAuditIntent(inputs[0]!),
      createSystemAuditIntent(inputs[1]!),
    ]);
    const winnerIndex = results.findIndex(
      ({ status }) => status === "fulfilled",
    );

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: "INCONSISTENT_OPERATION" }),
      }),
    ]);
    expect(winnerIndex).toBeGreaterThanOrEqual(0);
    await expect(
      prisma.auditOperation.findUniqueOrThrow({
        where: { id: operationId },
        select: { organisationId: true, targetId: true },
      }),
    ).resolves.toEqual({
      organisationId: inputs[winnerIndex]!.organisationId,
      targetId: inputs[winnerIndex]!.target.targetId,
    });
    await prisma.auditEvent.create({
      data: {
        operationId,
        type: "OUTCOME",
        result: "FAILED",
        resolvedTargetId: inputs[winnerIndex]!.organisationId,
      },
    });
  });

  it("classifies concurrent exact OUTCOME creation as review-required", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);

    const results = await Promise.allSettled([
      prisma.$transaction((transaction) =>
        appendAuditOutcomeInTransaction(transaction, intent, "SUCCEEDED"),
      ),
      prisma.$transaction((transaction) =>
        appendAuditOutcomeInTransaction(transaction, intent, "SUCCEEDED"),
      ),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: "OPERATION_REQUIRES_REVIEW" }),
      }),
    ]);
    await expect(
      prisma.auditEvent.count({
        where: { operationId: intent.operationId, type: "OUTCOME" },
      }),
    ).resolves.toBe(1);
  });

  it("classifies concurrent conflicting OUTCOME from the committed winner", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);
    const attemptedResults = ["SUCCEEDED", "FAILED"] as const;

    const results = await Promise.allSettled(
      attemptedResults.map((result) =>
        prisma.$transaction((transaction) =>
          appendAuditOutcomeInTransaction(transaction, intent, result),
        ),
      ),
    );
    const winnerIndex = results.findIndex(
      ({ status }) => status === "fulfilled",
    );

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: "INCONSISTENT_OPERATION" }),
      }),
    ]);
    expect(winnerIndex).toBeGreaterThanOrEqual(0);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: {
          operationId_type: {
            operationId: intent.operationId,
            type: "OUTCOME",
          },
        },
        select: { result: true },
      }),
    ).resolves.toEqual({ result: attemptedResults[winnerIndex] });
  });

  it("classifies concurrent identical RECOVERY as already recorded", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);
    await recordAmbiguousAuditOutcome(intent);

    const results = await Promise.allSettled([
      recordAuditRecovery(intent.operationId, "SUCCEEDED"),
      recordAuditRecovery(intent.operationId, "SUCCEEDED"),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: "RECOVERY_ALREADY_RECORDED" }),
      }),
    ]);
    await expect(
      prisma.auditEvent.count({
        where: { operationId: intent.operationId, type: "RECOVERY" },
      }),
    ).resolves.toBe(1);
  });

  it("classifies concurrent conflicting RECOVERY from the committed winner", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);
    const attemptedResults = ["SUCCEEDED", "FAILED"] as const;
    await recordAmbiguousAuditOutcome(intent);

    const results = await Promise.allSettled(
      attemptedResults.map((result) =>
        recordAuditRecovery(intent.operationId, result),
      ),
    );
    const winnerIndex = results.findIndex(
      ({ status }) => status === "fulfilled",
    );

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: "INCONSISTENT_OPERATION" }),
      }),
    ]);
    expect(winnerIndex).toBeGreaterThanOrEqual(0);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: {
          operationId_type: {
            operationId: intent.operationId,
            type: "RECOVERY",
          },
        },
        select: { result: true },
      }),
    ).resolves.toEqual({ result: attemptedResults[winnerIndex] });
  });

  it("preserves history through user deactivation and lifecycle deletion", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);

    await prisma.user.update({
      where: { id: actor.userId },
      data: { banned: true },
    });
    await expect(
      prisma.auditOperation.findUnique({ where: { id: intent.operationId } }),
    ).resolves.not.toBeNull();

    await prisma.user.delete({ where: { id: actor.userId } });
    fixtureUserIds.delete(actor.userId);
    await prisma.organisation.delete({
      where: { id: actor.organisationId },
    });
    fixtureOrganisationIds.delete(actor.organisationId);

    await expect(
      prisma.auditOperation.findUnique({ where: { id: intent.operationId } }),
    ).resolves.toMatchObject({
      actorUserId: actor.userId,
      organisationId: actor.organisationId,
    });
  });

  it("rejects UPDATE, DELETE and TRUNCATE for both audit tables", async () => {
    const actor = await createActor();
    const intent = await createUserIntent(actor);
    await recordFailedAuditOutcome(intent);
    const event = await prisma.auditEvent.findUniqueOrThrow({
      where: {
        operationId_type: {
          operationId: intent.operationId,
          type: "OUTCOME",
        },
      },
    });

    await expect(
      prisma.auditOperation.update({
        where: { id: intent.operationId },
        data: { action: "LOGIN_FAILED" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditEvent.update({
        where: { id: event.id },
        data: { result: "SUCCEEDED" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.auditOperation.delete({ where: { id: intent.operationId } }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`TRUNCATE TABLE "auditEvent"`,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`TRUNCATE TABLE "auditOperation"`,
    ).rejects.toThrow();
  });

  it("contains no metadata column and installs the required constraints and indexes", async () => {
    const columns = await prisma.$queryRaw<Array<{ columnName: string }>>`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('auditOperation', 'auditEvent')
    `;
    const constraints = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS "name"
      FROM pg_constraint
      WHERE conrelid IN ('"auditOperation"'::regclass, '"auditEvent"'::regclass)
    `;
    const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS "name"
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('auditOperation', 'auditEvent')
    `;

    expect(columns.map(({ columnName }) => columnName)).not.toContain(
      "metadata",
    );
    expect(constraints.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "auditOperation_actor_context_check",
        "auditOperation_action_format_check",
        "auditOperation_target_type_format_check",
        "auditEvent_type_result_check",
        "auditEvent_operationId_fkey",
      ]),
    );
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "auditOperation_organisationId_createdAt_idx",
        "auditOperation_actorUserId_createdAt_idx",
        "auditOperation_action_createdAt_idx",
        "auditEvent_operationId_type_key",
      ]),
    );
  });
});
