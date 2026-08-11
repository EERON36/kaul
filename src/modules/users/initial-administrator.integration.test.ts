import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { getTestEnvironment } from "../../test/test-environment";
import { auth } from "../authentication/auth";
import {
  bootstrapInitialAdministrator,
  InitialAdministratorBootstrapError,
  recoverInitialAdministratorBootstrap,
} from "./initial-administrator";
import {
  createSystemAuditIntent,
  createUnauthenticatedAuditIntent,
  generateAuditOperationId,
  recordFailedAuditOutcome,
} from "../audit/audit";
import { bootstrapInitialAdministratorForTest } from "./initial-administrator.test-support";

const fictionalMetadata = {
  organisationName: "Fiktiva Omsorgen",
  administratorName: "Fiktiv Administratör",
  administratorEmail: "Initial.Admin@Example.Test",
  professionalTitle: "Fiktiv verksamhetsansvarig",
};
const testOrigin = getTestEnvironment().origin;

async function clearAuthenticationFoundation(): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.rateLimit.deleteMany();
}

async function foundationCounts() {
  const [organisations, users, accounts, administrators] = await Promise.all([
    prisma.organisation.count(),
    prisma.user.count(),
    prisma.account.count(),
    prisma.user.count({ where: { role: UserRole.ADMINISTRATOR } }),
  ]);

  return { organisations, users, accounts, administrators };
}

beforeEach(clearAuthenticationFoundation);
afterEach(clearAuthenticationFoundation);

describe("initial Administrator bootstrap with PostgreSQL", () => {
  it("creates and authenticates exactly one constrained initial Administrator", async () => {
    const creationTime = new Date("2030-01-02T03:04:05.000Z");
    const result = await bootstrapInitialAdministratorForTest(
      fictionalMetadata,
      {
        currentTime: () => creationTime,
      },
    );

    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 1,
      accounts: 1,
      administrators: 1,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: result.administratorEmail },
      select: {
        name: true,
        email: true,
        role: true,
        organisationId: true,
        professionalTitle: true,
        mustChangePassword: true,
        temporaryCredentialExpiresAt: true,
      },
    });
    const credentialAccountCount = await prisma.account.count({
      where: {
        user: { email: result.administratorEmail },
        providerId: "credential",
        password: { not: null },
      },
    });

    expect(user).toMatchObject({
      name: fictionalMetadata.administratorName,
      email: "initial.admin@example.test",
      role: UserRole.ADMINISTRATOR,
      professionalTitle: fictionalMetadata.professionalTitle,
      mustChangePassword: true,
    });
    expect(user.organisationId).not.toBe("");
    expect(user.temporaryCredentialExpiresAt).toEqual(
      new Date("2030-01-03T03:04:05.000Z"),
    );
    expect(credentialAccountCount).toBe(1);
    await expect(
      prisma.auditOperation.findFirstOrThrow({
        where: {
          action: "INITIAL_ADMIN_CREATED",
          targetId: user.organisationId,
        },
        select: {
          actorKind: true,
          organisationId: true,
          targetId: true,
          events: { select: { result: true } },
        },
      }),
    ).resolves.toEqual({
      actorKind: "SYSTEM",
      organisationId: user.organisationId,
      targetId: user.organisationId,
      events: [{ result: "SUCCEEDED" }],
    });

    const signIn = await auth.api.signInEmail({
      body: {
        email: result.administratorEmail,
        password: result.temporaryCredential,
      },
      headers: new Headers({
        origin: testOrigin,
        "x-real-ip": "192.0.2.81",
      }),
      asResponse: true,
    });

    expect(signIn.status).toBe(200);

    await expect(
      bootstrapInitialAdministrator({
        ...fictionalMetadata,
        administratorEmail: "second.admin@example.test",
      }),
    ).rejects.toMatchObject({ code: "INSTALLATION_NOT_EMPTY" });
    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 1,
      accounts: 1,
      administrators: 1,
    });
  });

  it("refuses an existing Organisation with no writes", async () => {
    const auditCountBefore = await prisma.auditOperation.count({
      where: { action: "INITIAL_ADMIN_CREATED" },
    });
    await prisma.organisation.create({
      data: { id: randomUUID(), name: "Befintlig fiktiv organisation" },
    });

    await expect(
      bootstrapInitialAdministrator(fictionalMetadata),
    ).rejects.toBeInstanceOf(InitialAdministratorBootstrapError);
    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 0,
      accounts: 0,
      administrators: 0,
    });
    await expect(
      prisma.auditOperation.count({
        where: { action: "INITIAL_ADMIN_CREATED" },
      }),
    ).resolves.toBe(auditCountBefore);
  });

  it("recovers only an exact unresolved operation after proving emptiness", async () => {
    const operationId = generateAuditOperationId();
    const organisationId = randomUUID();
    await createSystemAuditIntent({
      operationId,
      organisationId,
      action: "INITIAL_ADMIN_CREATED",
      target: { targetId: organisationId },
    });

    await recoverInitialAdministratorBootstrap(operationId);
    await expect(
      prisma.auditEvent.findMany({
        where: { operationId },
        select: { result: true },
      }),
    ).resolves.toEqual([{ result: "FAILED" }]);

    const result = await bootstrapInitialAdministrator(fictionalMetadata);
    const succeeded = await prisma.auditOperation.findFirstOrThrow({
      where: {
        action: "INITIAL_ADMIN_CREATED",
        targetId: { not: organisationId },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, events: { select: { result: true } } },
    });
    expect(succeeded.id).not.toBe(operationId);
    expect(succeeded.events).toEqual([{ result: "SUCCEEDED" }]);
    expect(result.temporaryCredential).not.toBe("");
  });

  it("refuses recovery when the installation is not empty without appending an event", async () => {
    const operationId = generateAuditOperationId();
    const organisationId = randomUUID();
    await createSystemAuditIntent({
      operationId,
      organisationId,
      action: "INITIAL_ADMIN_CREATED",
      target: { targetId: organisationId },
    });
    await prisma.organisation.create({
      data: { id: randomUUID(), name: "Befintlig fiktiv organisation" },
    });

    await expect(
      recoverInitialAdministratorBootstrap(operationId),
    ).rejects.toThrow();
    await expect(
      prisma.auditEvent.count({ where: { operationId } }),
    ).resolves.toBe(0);
    await prisma.organisation.deleteMany();
    await recoverInitialAdministratorBootstrap(operationId);
  });

  it("refuses recovery for an already terminal operation", async () => {
    const operationId = generateAuditOperationId();
    const organisationId = randomUUID();
    const intent = await createSystemAuditIntent({
      operationId,
      organisationId,
      action: "INITIAL_ADMIN_CREATED",
      target: { targetId: organisationId },
    });
    await recordFailedAuditOutcome(intent);

    await expect(
      recoverInitialAdministratorBootstrap(operationId),
    ).rejects.toThrow();
    await expect(
      prisma.auditEvent.count({ where: { operationId } }),
    ).resolves.toBe(1);
  });

  it("refuses recovery for incompatible audit context", async () => {
    const operationId = generateAuditOperationId();
    await createUnauthenticatedAuditIntent({
      operationId,
      action: "LOGIN_FAILED",
    });

    await expect(
      recoverInitialAdministratorBootstrap(operationId),
    ).rejects.toThrow();
    await expect(
      prisma.auditEvent.count({ where: { operationId } }),
    ).resolves.toBe(0);
  });

  it("recovers only the specified unresolved operation", async () => {
    const ids = [generateAuditOperationId(), generateAuditOperationId()];
    for (const operationId of ids) {
      const organisationId = randomUUID();
      await createSystemAuditIntent({
        operationId,
        organisationId,
        action: "INITIAL_ADMIN_CREATED",
        target: { targetId: organisationId },
      });
    }

    await recoverInitialAdministratorBootstrap(ids[0]!);
    await expect(
      prisma.auditEvent.count({ where: { operationId: ids[0] } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({ where: { operationId: ids[1] } }),
    ).resolves.toBe(0);
    await recoverInitialAdministratorBootstrap(ids[1]!);
  });

  it("refuses existing User and Organisation state with no writes", async () => {
    const organisationId = randomUUID();
    await prisma.organisation.create({
      data: { id: organisationId, name: "Befintlig fiktiv organisation" },
    });
    await prisma.user.create({
      data: {
        id: randomUUID(),
        name: "Befintlig fiktiv användare",
        email: "existing.user@example.test",
        organisationId,
        professionalTitle: "Fiktiv behandlare",
      },
    });

    await expect(
      bootstrapInitialAdministrator(fictionalMetadata),
    ).rejects.toMatchObject({ code: "INSTALLATION_NOT_EMPTY" });
    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 1,
      accounts: 0,
      administrators: 0,
    });
  });

  it("creates no records when metadata is invalid", async () => {
    const invalidMetadata = {
      ...fictionalMetadata,
      role: UserRole.STAFF_MEMBER,
    };

    await expect(
      bootstrapInitialAdministrator(invalidMetadata),
    ).rejects.toThrow();

    expect(await foundationCounts()).toEqual({
      organisations: 0,
      users: 0,
      accounts: 0,
      administrators: 0,
    });
  });

  it("rolls back Organisation, User, and Account after Better Auth succeeds", async () => {
    await expect(
      bootstrapInitialAdministratorForTest(fictionalMetadata, {
        afterAuthenticationCreate: () => {
          throw new Error("Deliberate pre-commit integration failure");
        },
      }),
    ).rejects.toThrow("Deliberate pre-commit integration failure");

    expect(await foundationCounts()).toEqual({
      organisations: 0,
      users: 0,
      accounts: 0,
      administrators: 0,
    });
  });

  it("serializes concurrent attempts so exactly one succeeds", async () => {
    const operationIds: string[] = [];
    let waitingOperations = 0;
    let releaseOperations: (() => void) | undefined;
    const bothReady = new Promise<void>((resolve) => {
      releaseOperations = resolve;
    });
    const waitForBothPreflights = async () => {
      waitingOperations += 1;

      if (waitingOperations === 2) {
        releaseOperations?.();
      }

      await bothReady;
    };

    const attempts = await Promise.allSettled([
      bootstrapInitialAdministratorForTest(fictionalMetadata, {
        afterAuditIntent: (operationId) => {
          operationIds.push(operationId);
        },
        beforeTransaction: waitForBothPreflights,
      }),
      bootstrapInitialAdministratorForTest(
        {
          ...fictionalMetadata,
          administratorEmail: "concurrent.admin@example.test",
        },
        {
          afterAuditIntent: (operationId) => {
            operationIds.push(operationId);
          },
          beforeTransaction: waitForBothPreflights,
        },
      ),
    ]);

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 1,
      accounts: 1,
      administrators: 1,
    });
    expect(operationIds).toHaveLength(2);
    const operations = await prisma.auditOperation.findMany({
      where: { id: { in: operationIds } },
      select: { id: true, events: { select: { result: true } } },
    });
    expect(operations).toHaveLength(2);
    expect(
      operations.flatMap(({ events }) => events.map(({ result }) => result)),
    ).toEqual(expect.arrayContaining(["SUCCEEDED", "FAILED"]));
    expect(operations.every(({ events }) => events.length === 1)).toBe(true);
  });
});
