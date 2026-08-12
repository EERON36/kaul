import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { ClientStatus, UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { generateAuditOperationId } from "../audit/audit";
import type { ApplicationUser } from "../authentication/guards";
import type { AdministratorUser } from "../users/authorization";
import { findAccessibleClientForUser } from "./client-access";
import {
  archiveClientForTest,
  createAssignmentForTest,
  createClientForTest,
  endAssignmentForTest,
  updateClientForTest,
} from "./clients.test-support";
import {
  listArchivedClientsInternal,
  listClientsInternal,
} from "./clients-internal";

const organisationIds = new Set<string>();

async function cleanupFixtures(): Promise<void> {
  if (organisationIds.size === 0) return;
  const ids = [...organisationIds];
  await prisma.assignment.deleteMany({
    where: { organisationId: { in: ids } },
  });
  await prisma.client.deleteMany({ where: { organisationId: { in: ids } } });
  await prisma.session.deleteMany({
    where: { user: { organisationId: { in: ids } } },
  });
  await prisma.account.deleteMany({
    where: { user: { organisationId: { in: ids } } },
  });
  await prisma.user.deleteMany({ where: { organisationId: { in: ids } } });
  await prisma.organisation.deleteMany({ where: { id: { in: ids } } });
  organisationIds.clear();
}

afterEach(cleanupFixtures);

async function createOrganisation(name: string) {
  const id = randomUUID();
  organisationIds.add(id);
  await prisma.organisation.create({ data: { id, name } });
  return id;
}

async function createUser(
  organisationId: string,
  role: UserRole,
  label: string,
) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      name: `Fiktiv ${label}`,
      email: `${label.toLowerCase().replaceAll(" ", ".")}.${id}@example.test`,
      role,
      banned: false,
      organisationId,
      professionalTitle: "Fiktiv yrkestitel",
      mustChangePassword: false,
    },
  });
}

function applicationUser(
  user: Awaited<ReturnType<typeof createUser>>,
  organisationName: string,
): ApplicationUser {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organisationId: user.organisationId,
    organisationName,
    professionalTitle: user.professionalTitle,
    mustChangePassword: false,
    credentialState: "APPLICATION_ALLOWED",
  };
}

function administrator(
  user: Awaited<ReturnType<typeof createUser>>,
  organisationName: string,
): AdministratorUser {
  return applicationUser(user, organisationName) as AdministratorUser;
}

async function createFixtureClient(
  actor: AdministratorUser,
  reference: string,
  category: "ADULT" | "YOUTH" = "ADULT",
) {
  return createClientForTest(
    {
      operationId: generateAuditOperationId(),
      firstName: "Fiktiv",
      lastName: "Arkivklient",
      personIdentifier: reference,
      category,
    },
    actor,
    {},
  );
}

async function assign(
  actor: AdministratorUser,
  clientId: string,
  staffUserId: string,
  responsibility: "PRIMARY" | "SECONDARY",
) {
  await createAssignmentForTest(
    {
      operationId: generateAuditOperationId(),
      clientId,
      staffUserId,
      responsibility,
    },
    actor,
    {},
  );
  return prisma.assignment.findFirstOrThrow({
    where: { clientId, staffUserId, endedAt: null },
  });
}

async function end(
  actor: AdministratorUser,
  assignmentId: string,
  dependencies: Parameters<typeof endAssignmentForTest>[2] = {},
) {
  return endAssignmentForTest(
    { operationId: generateAuditOperationId(), assignmentId },
    actor,
    dependencies,
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("Client archiving with PostgreSQL", () => {
  it("archives an eligible Client atomically with immutable audit evidence while preserving Assignment history", async () => {
    const organisationName = "Fiktiva Arkivorganisationen";
    const organisationId = await createOrganisation(organisationName);
    const adminUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Arkivadministratör",
    );
    const primaryUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Arkivprimär",
    );
    const secondaryUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Arkivsekundär",
    );
    const actor = administrator(adminUser, organisationName);
    const client = await createFixtureClient(actor, "ARKIV-01", "YOUTH");
    const primary = await assign(actor, client.id, primaryUser.id, "PRIMARY");
    const secondary = await assign(
      actor,
      client.id,
      secondaryUser.id,
      "SECONDARY",
    );
    await end(actor, primary.id);
    await end(actor, secondary.id);
    const beforeAssignments = await prisma.assignment.findMany({
      where: { clientId: client.id },
      orderBy: { id: "asc" },
    });
    const operationId = generateAuditOperationId();
    const beforeArchive = new Date();

    const result = await archiveClientForTest(
      { operationId, clientId: client.id },
      actor,
      {},
    );

    expect(result.clientId).toBe(client.id);
    expect(result.archivedAt.getTime()).toBeGreaterThanOrEqual(
      beforeArchive.getTime(),
    );
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({
      id: client.id,
      organisationId,
      firstName: client.firstName,
      lastName: client.lastName,
      personIdentifier: client.personIdentifier,
      category: client.category,
      status: ClientStatus.ARCHIVED,
      archivedAt: result.archivedAt,
    });
    expect(
      await prisma.assignment.findMany({
        where: { clientId: client.id },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeAssignments);
    await expect(
      prisma.auditOperation.findUniqueOrThrow({ where: { id: operationId } }),
    ).resolves.toMatchObject({
      organisationId,
      actorUserId: actor.userId,
      action: "CLIENT_ARCHIVED",
      targetType: "CLIENT",
      targetId: client.id,
    });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({
      result: "SUCCEEDED",
      resolvedTargetId: client.id,
    });
    const auditJson = JSON.stringify(
      await prisma.auditOperation.findUniqueOrThrow({
        where: { id: operationId },
      }),
    );
    expect(auditJson).not.toContain(client.firstName);
    expect(auditJson).not.toContain(client.personIdentifier);
    expect(
      await prisma.auditOperation.count({
        where: {
          action: "ASSIGNMENT_ENDED",
          createdAt: { gte: beforeArchive },
          targetId: { in: [primary.id, secondary.id] },
        },
      }),
    ).toBe(0);
  });

  it("fails closed for Staff, cross-Organisation, missing, repeated, and wrong-state archive attempts", async () => {
    const firstName = "Fiktiva Första Arkivgränsen";
    const secondName = "Fiktiva Andra Arkivgränsen";
    const firstOrganisationId = await createOrganisation(firstName);
    const secondOrganisationId = await createOrganisation(secondName);
    const firstAdminUser = await createUser(
      firstOrganisationId,
      UserRole.ADMINISTRATOR,
      "Första arkivgränsadmin",
    );
    const secondAdminUser = await createUser(
      secondOrganisationId,
      UserRole.ADMINISTRATOR,
      "Andra arkivgränsadmin",
    );
    const staffUser = await createUser(
      firstOrganisationId,
      UserRole.STAFF_MEMBER,
      "Otillåten arkivmedarbetare",
    );
    const firstActor = administrator(firstAdminUser, firstName);
    const secondActor = administrator(secondAdminUser, secondName);
    const staffActor = applicationUser(
      staffUser,
      firstName,
    ) as AdministratorUser;
    const foreignClient = await createFixtureClient(
      secondActor,
      "HEMLIG-ARKIV",
    );

    for (const [attemptActor, clientId] of [
      [staffActor, foreignClient.id],
      [firstActor, foreignClient.id],
      [firstActor, randomUUID()],
    ] as const) {
      const operationId = generateAuditOperationId();
      await expect(
        archiveClientForTest({ operationId, clientId }, attemptActor, {}),
      ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
      expect(
        await prisma.auditOperation.findUnique({ where: { id: operationId } }),
      ).toBeNull();
    }

    const primaryUser = await createUser(
      secondOrganisationId,
      UserRole.STAFF_MEMBER,
      "Aktiv arkivgränsprimär",
    );
    await assign(secondActor, foreignClient.id, primaryUser.id, "PRIMARY");
    const activeOperationId = generateAuditOperationId();
    await expect(
      archiveClientForTest(
        { operationId: activeOperationId, clientId: foreignClient.id },
        secondActor,
        {},
      ),
    ).rejects.toMatchObject({ code: "ACTIVE_ASSIGNMENTS" });
    expect(
      await prisma.auditOperation.findUnique({
        where: { id: activeOperationId },
      }),
    ).toBeNull();
  });

  it("blocks active primary, active secondary, and retained active secondary Assignments until all are manually ended", async () => {
    const organisationName = "Fiktiva Tilldelningsarkivregeln";
    const organisationId = await createOrganisation(organisationName);
    const adminUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Tilldelningsarkivadministratör",
    );
    const primaryUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Tilldelningsarkivprimär",
    );
    const secondaryUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Tilldelningsarkivsekundär",
    );
    const actor = administrator(adminUser, organisationName);
    const client = await createFixtureClient(actor, "ARKIV-TILLDELNING");
    const primary = await assign(actor, client.id, primaryUser.id, "PRIMARY");
    const secondary = await assign(
      actor,
      client.id,
      secondaryUser.id,
      "SECONDARY",
    );

    await expect(
      archiveClientForTest(
        { operationId: generateAuditOperationId(), clientId: client.id },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: "ACTIVE_ASSIGNMENTS" });
    await end(actor, primary.id);
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({ status: ClientStatus.INACTIVE });
    const retainedOperationId = generateAuditOperationId();
    await expect(
      archiveClientForTest(
        { operationId: retainedOperationId, clientId: client.id },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: "ACTIVE_ASSIGNMENTS" });
    expect(
      await prisma.auditOperation.findUnique({
        where: { id: retainedOperationId },
      }),
    ).toBeNull();
    await end(actor, secondary.id);
    await expect(
      archiveClientForTest(
        { operationId: generateAuditOperationId(), clientId: client.id },
        actor,
        {},
      ),
    ).resolves.toMatchObject({ clientId: client.id });
  });

  it("allows at most one of two concurrent Administrators to archive the same Client", async () => {
    const organisationName = "Fiktiva Samtidiga Arkivorganisationen";
    const organisationId = await createOrganisation(organisationName);
    const firstUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Första samtidiga arkivadministratör",
    );
    const secondUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Andra samtidiga arkivadministratör",
    );
    const firstActor = administrator(firstUser, organisationName);
    const secondActor = administrator(secondUser, organisationName);
    const client = await createFixtureClient(firstActor, "SAMTIDIG-ARKIV");
    const operationIds = [
      generateAuditOperationId(),
      generateAuditOperationId(),
    ];

    const attempts = await Promise.allSettled([
      archiveClientForTest(
        { operationId: operationIds[0], clientId: client.id },
        firstActor,
        {},
      ),
      archiveClientForTest(
        { operationId: operationIds[1], clientId: client.id },
        secondActor,
        {},
      ),
    ]);

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({
      status: ClientStatus.ARCHIVED,
      archivedAt: expect.any(Date),
    });
    expect(
      await prisma.auditEvent.count({
        where: {
          operationId: { in: operationIds },
          type: "OUTCOME",
          result: "SUCCEEDED",
        },
      }),
    ).toBe(1);
  });

  it("serializes Assignment creation and archive in both lock orders without an archived active Assignment", async () => {
    const organisationName = "Fiktiva Arkivskapandekapplöpningen";
    const organisationId = await createOrganisation(organisationName);
    const adminUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Arkivskapandeadministratör",
    );
    const firstStaff = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Arkivskapandeförst",
    );
    const secondStaff = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Arkivskapandeandra",
    );
    const actor = administrator(adminUser, organisationName);

    const assignmentFirstClient = await createFixtureClient(
      actor,
      "TILLDELNING-FÖRST",
    );
    const archivePaused = deferred();
    const allowArchive = deferred();
    const archiveAfterAssignment = archiveClientForTest(
      {
        operationId: generateAuditOperationId(),
        clientId: assignmentFirstClient.id,
      },
      actor,
      {
        beforeBusinessTransaction: async () => {
          archivePaused.resolve();
          await allowArchive.promise;
        },
      },
    );
    await archivePaused.promise;
    await assign(actor, assignmentFirstClient.id, firstStaff.id, "PRIMARY");
    allowArchive.resolve();
    await expect(archiveAfterAssignment).rejects.toMatchObject({
      code: "ACTIVE_ASSIGNMENTS",
    });

    const archiveFirstClient = await createFixtureClient(actor, "ARKIV-FÖRST");
    const archiveMutated = deferred();
    const allowArchiveCommit = deferred();
    const archiveFirst = archiveClientForTest(
      {
        operationId: generateAuditOperationId(),
        clientId: archiveFirstClient.id,
      },
      actor,
      {
        afterBusinessMutation: async () => {
          archiveMutated.resolve();
          await allowArchiveCommit.promise;
        },
      },
    );
    await archiveMutated.promise;
    const assignmentAfterArchive = createAssignmentForTest(
      {
        operationId: generateAuditOperationId(),
        clientId: archiveFirstClient.id,
        staffUserId: secondStaff.id,
        responsibility: "PRIMARY",
      },
      actor,
      {},
    );
    allowArchiveCommit.resolve();
    await expect(archiveFirst).resolves.toMatchObject({
      clientId: archiveFirstClient.id,
    });
    await expect(assignmentAfterArchive).rejects.toMatchObject({
      code: "TARGET_UNAVAILABLE",
    });

    for (const clientId of [assignmentFirstClient.id, archiveFirstClient.id]) {
      const current = await prisma.client.findUniqueOrThrow({
        where: { id: clientId },
        select: {
          status: true,
          _count: { select: { assignments: { where: { endedAt: null } } } },
        },
      });
      expect(
        current.status === ClientStatus.ARCHIVED &&
          current._count.assignments > 0,
      ).toBe(false);
    }
  });

  it("serializes Assignment ending with archive and requires a later explicit archive attempt", async () => {
    const organisationName = "Fiktiva Arkivavslutningskapplöpningen";
    const organisationId = await createOrganisation(organisationName);
    const adminUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Arkivavslutningsadministratör",
    );
    const staffUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Arkivavslutningsprimär",
    );
    const actor = administrator(adminUser, organisationName);
    const client = await createFixtureClient(actor, "ARKIV-AVSLUTNING");
    const assignment = await assign(actor, client.id, staffUser.id, "PRIMARY");
    const archiveOperationId = generateAuditOperationId();
    const endingMutated = deferred();
    const allowEndingCommit = deferred();
    const ending = end(actor, assignment.id, {
      afterBusinessMutation: async () => {
        endingMutated.resolve();
        await allowEndingCommit.promise;
      },
    });
    await endingMutated.promise;

    await expect(
      archiveClientForTest(
        { operationId: archiveOperationId, clientId: client.id },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: "ACTIVE_ASSIGNMENTS" });
    allowEndingCommit.resolve();
    await expect(ending).resolves.toMatchObject({ clientId: client.id });
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({
      status: ClientStatus.INACTIVE,
      archivedAt: null,
    });
    expect(
      await prisma.auditEvent.count({
        where: {
          operationId: archiveOperationId,
          result: "SUCCEEDED",
        },
      }),
    ).toBe(0);
    await expect(
      archiveClientForTest(
        { operationId: generateAuditOperationId(), clientId: client.id },
        actor,
        {},
      ),
    ).resolves.toMatchObject({ clientId: client.id });
  });

  it("makes archived Clients read-only and separates ordinary, archived, and Staff access", async () => {
    const organisationName = "Fiktiva Arkivseparationsorganisationen";
    const organisationId = await createOrganisation(organisationName);
    const adminUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Arkivseparationsadministratör",
    );
    const staffUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Arkivseparationsmedarbetare",
    );
    const actor = administrator(adminUser, organisationName);
    const staff = applicationUser(staffUser, organisationName);
    const client = await createFixtureClient(actor, "ARKIV-SEPARATION");
    await archiveClientForTest(
      { operationId: generateAuditOperationId(), clientId: client.id },
      actor,
      {},
    );

    expect(
      (await listClientsInternal(actor)).map(({ id }) => id),
    ).not.toContain(client.id);
    expect(
      (await listArchivedClientsInternal(actor)).map(({ id }) => id),
    ).toContain(client.id);
    expect(
      (await listClientsInternal(staff)).map(({ id }) => id),
    ).not.toContain(client.id);
    await expect(
      findAccessibleClientForUser(client.id, actor),
    ).resolves.toMatchObject({ id: client.id, status: ClientStatus.ARCHIVED });
    await expect(
      findAccessibleClientForUser(client.id, staff),
    ).resolves.toBeNull();

    const updateOperationId = generateAuditOperationId();
    await expect(
      updateClientForTest(
        {
          operationId: updateOperationId,
          clientId: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          personIdentifier: client.personIdentifier,
          category: client.category,
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    expect(
      await prisma.auditOperation.findUnique({
        where: { id: updateOperationId },
      }),
    ).toBeNull();
    await expect(
      createAssignmentForTest(
        {
          operationId: generateAuditOperationId(),
          clientId: client.id,
          staffUserId: staffUser.id,
          responsibility: "PRIMARY",
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });

    const repeatedOperationId = generateAuditOperationId();
    await expect(
      archiveClientForTest(
        { operationId: repeatedOperationId, clientId: client.id },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: "ARCHIVE_STATE_CONFLICT" });
    expect(
      await prisma.auditOperation.findUnique({
        where: { id: repeatedOperationId },
      }),
    ).toBeNull();
  });

  it("rolls back archive state and records FAILED when transaction work fails definitively", async () => {
    const organisationName = "Fiktiva Arkivåterställningsorganisationen";
    const organisationId = await createOrganisation(organisationName);
    const adminUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Arkivåterställningsadministratör",
    );
    const actor = administrator(adminUser, organisationName);
    const client = await createFixtureClient(actor, "ARKIV-ÅTERSTÄLLNING");
    const operationId = generateAuditOperationId();

    await expect(
      archiveClientForTest({ operationId, clientId: client.id }, actor, {
        afterBusinessMutation: () => {
          throw new Error("Fictional forced archive rollback");
        },
      }),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({
      status: ClientStatus.INACTIVE,
      archivedAt: null,
    });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("keeps the database Client status/archive-date consistency constraint effective", async () => {
    const organisationName = "Fiktiva Arkivvillkorsorganisationen";
    const organisationId = await createOrganisation(organisationName);
    const adminUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Arkivvillkorsadministratör",
    );
    const actor = administrator(adminUser, organisationName);
    const client = await createFixtureClient(actor, "ARKIV-VILLKOR");

    await expect(
      prisma.client.update({
        where: { id: client.id },
        data: { status: ClientStatus.ARCHIVED, archivedAt: null },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.client.update({
        where: { id: client.id },
        data: { status: ClientStatus.INACTIVE, archivedAt: new Date() },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({
      status: ClientStatus.INACTIVE,
      archivedAt: null,
    });
  });
});
