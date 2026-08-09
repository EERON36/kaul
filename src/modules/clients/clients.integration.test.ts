import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  AssignmentResponsibility,
  ClientStatus,
  UserRole,
} from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { generateAuditOperationId } from "../audit/audit";
import type { ApplicationUser } from "../authentication/guards";
import type { AdministratorUser } from "../users/authorization";
import { findAccessibleClientForUser } from "./client-access";
import {
  createAssignmentForTest,
  createClientForTest,
  endAssignmentForTest,
} from "./clients.test-support";
import { listClientsInternal } from "./clients-internal";

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
  banned: boolean | null = false,
) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      name: `Fiktiv ${label}`,
      email: `${label.toLowerCase().replaceAll(" ", ".")}.${id}@example.test`,
      role,
      banned,
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
) {
  return createClientForTest(
    {
      operationId: generateAuditOperationId(),
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: reference,
      category: "Fiktiv kategori",
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
  const operationId = generateAuditOperationId();
  await createAssignmentForTest(
    { operationId, clientId, staffUserId, responsibility },
    actor,
    {},
  );
  return prisma.assignment.findFirstOrThrow({
    where: { clientId, staffUserId, endedAt: null },
  });
}

describe("Client foundation with PostgreSQL", () => {
  it("creates an INACTIVE organisation-owned Client with canonical uniqueness and audit", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Klientorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Administratör",
    );
    const actor = administrator(actorUser, "Fiktiva Klientorganisationen");
    const operationId = generateAuditOperationId();

    const created = await createClientForTest(
      {
        operationId,
        firstName: " Fiktiv ",
        lastName: " Klient ",
        personIdentifier: " fiktiv-é-01 ",
        category: " Fiktiv kategori ",
      },
      actor,
      {},
    );

    expect(created).toMatchObject({
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: "FIKTIV-É-01",
      category: "Fiktiv kategori",
      status: ClientStatus.INACTIVE,
    });
    await expect(
      prisma.auditOperation.findUniqueOrThrow({ where: { id: operationId } }),
    ).resolves.toMatchObject({
      organisationId,
      actorUserId: actor.userId,
      action: "CLIENT_CREATED",
      targetType: "CLIENT",
      targetId: created.id,
    });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({
      result: "SUCCEEDED",
      resolvedTargetId: created.id,
    });
    const auditJson = JSON.stringify(
      await prisma.auditOperation.findUniqueOrThrow({
        where: { id: operationId },
      }),
    );
    expect(auditJson).not.toContain("FIKTIV-É-01");
    expect(auditJson).not.toContain("Fiktiv Klient");

    const duplicateOperationId = generateAuditOperationId();
    await expect(
      createClientForTest(
        {
          operationId: duplicateOperationId,
          firstName: "Annan",
          lastName: "Klient",
          personIdentifier: "FIKTIV-E\u0301-01",
          category: "Fiktiv kategori",
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER" });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: {
          operationId_type: {
            operationId: duplicateOperationId,
            type: "OUTCOME",
          },
        },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });

    const otherOrganisationId = await createOrganisation(
      "Fiktiva Andra Organisationen",
    );
    const otherActorUser = await createUser(
      otherOrganisationId,
      UserRole.ADMINISTRATOR,
      "Annan administratör",
    );
    await expect(
      createFixtureClient(
        administrator(otherActorUser, "Fiktiva Andra Organisationen"),
        "fiktiv-é-01",
      ),
    ).resolves.toMatchObject({ personIdentifier: "FIKTIV-É-01" });
  });

  it("enforces active primary/secondary access, history, loss and regain", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Åtkomstorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Åtkomstadministratör",
    );
    const primaryUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Primär medarbetare",
    );
    const secondaryUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Sekundär medarbetare",
    );
    const unrelatedUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Orelaterad medarbetare",
    );
    const actor = administrator(actorUser, "Fiktiva Åtkomstorganisationen");
    const client = await createFixtureClient(actor, "ÅTKOMST-01");

    expect(
      await listClientsInternal(
        applicationUser(primaryUser, actor.organisationName),
      ),
    ).toEqual([]);
    const primary = await assign(actor, client.id, primaryUser.id, "PRIMARY");
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({ status: ClientStatus.ACTIVE });
    const secondary = await assign(
      actor,
      client.id,
      secondaryUser.id,
      "SECONDARY",
    );
    expect(
      await listClientsInternal(
        applicationUser(primaryUser, actor.organisationName),
      ),
    ).toHaveLength(1);
    expect(
      await listClientsInternal(
        applicationUser(secondaryUser, actor.organisationName),
      ),
    ).toHaveLength(1);
    expect(
      await findAccessibleClientForUser(
        client.id,
        applicationUser(unrelatedUser, actor.organisationName),
      ),
    ).toBeNull();

    await endAssignmentForTest(
      { operationId: generateAuditOperationId(), assignmentId: secondary.id },
      actor,
      {},
    );
    expect(
      await findAccessibleClientForUser(
        client.id,
        applicationUser(secondaryUser, actor.organisationName),
      ),
    ).toBeNull();
    expect(
      await findAccessibleClientForUser(
        client.id,
        applicationUser(primaryUser, actor.organisationName),
      ),
    ).not.toBeNull();

    const retainedSecondary = await assign(
      actor,
      client.id,
      secondaryUser.id,
      "SECONDARY",
    );
    await endAssignmentForTest(
      { operationId: generateAuditOperationId(), assignmentId: primary.id },
      actor,
      {},
    );
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({ status: ClientStatus.INACTIVE });
    expect(
      await findAccessibleClientForUser(
        client.id,
        applicationUser(primaryUser, actor.organisationName),
      ),
    ).toBeNull();
    expect(
      await findAccessibleClientForUser(
        client.id,
        applicationUser(secondaryUser, actor.organisationName),
      ),
    ).toBeNull();
    expect(
      (
        await prisma.assignment.findUniqueOrThrow({
          where: { id: retainedSecondary.id },
        })
      ).endedAt,
    ).toBeNull();

    await assign(actor, client.id, unrelatedUser.id, "PRIMARY");
    expect(
      await findAccessibleClientForUser(
        client.id,
        applicationUser(secondaryUser, actor.organisationName),
      ),
    ).not.toBeNull();
    expect(
      await prisma.assignment.count({ where: { clientId: client.id } }),
    ).toBe(4);
    expect(
      await prisma.assignment.count({
        where: { clientId: client.id, endedAt: { not: null } },
      }),
    ).toBe(2);
  });

  it("denies unsafe targets and structurally prevents cross-Organisation assignments", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Gränsorganisationen",
    );
    const otherOrganisationId = await createOrganisation(
      "Fiktiva Främmande Organisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Gränsadministratör",
    );
    const foreignStaff = await createUser(
      otherOrganisationId,
      UserRole.STAFF_MEMBER,
      "Främmande medarbetare",
    );
    const inactiveStaff = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Inaktiv medarbetare",
      true,
    );
    const actor = administrator(actorUser, "Fiktiva Gränsorganisationen");
    const client = await createFixtureClient(actor, "GRÄNS-01");

    for (const targetId of [foreignStaff.id, inactiveStaff.id, actor.userId]) {
      await expect(
        createAssignmentForTest(
          {
            operationId: generateAuditOperationId(),
            clientId: client.id,
            staffUserId: targetId,
            responsibility: "PRIMARY",
          },
          actor,
          {},
        ),
      ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    }

    await expect(
      prisma.assignment.create({
        data: {
          id: randomUUID(),
          organisationId,
          clientId: client.id,
          staffUserId: foreignStaff.id,
          responsibility: AssignmentResponsibility.PRIMARY,
          createdByUserId: actor.userId,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("fails closed when SECONDARY has no active primary", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Sekundärgränsorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Sekundärgränsadministratör",
    );
    const staff = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Sekundärgränsmedarbetare",
    );
    const actor = administrator(
      actorUser,
      "Fiktiva Sekundärgränsorganisationen",
    );
    const client = await createFixtureClient(actor, "SEKUNDÄR-GRÄNS-01");

    for (const status of [ClientStatus.INACTIVE, ClientStatus.ACTIVE]) {
      await prisma.client.update({
        where: { id: client.id },
        data: { status },
      });
      const operationId = generateAuditOperationId();

      await expect(
        createAssignmentForTest(
          {
            operationId,
            clientId: client.id,
            staffUserId: staff.id,
            responsibility: "SECONDARY",
          },
          actor,
          {},
        ),
      ).rejects.toMatchObject({ code: "ASSIGNMENT_CONFLICT" });
      expect(
        await prisma.assignment.count({ where: { clientId: client.id } }),
      ).toBe(0);
      await expect(
        prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
      ).resolves.toMatchObject({ status });
      await expect(
        prisma.auditEvent.findUniqueOrThrow({
          where: { operationId_type: { operationId, type: "OUTCOME" } },
        }),
      ).resolves.toMatchObject({ result: "FAILED" });
    }
  });

  it("supports multiple distinct active secondary Staff Members", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Flersekundärorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Flersekundäradministratör",
    );
    const primaryStaff = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Flersekundär primär",
    );
    const firstSecondary = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Flersekundär första",
    );
    const secondSecondary = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Flersekundär andra",
    );
    const actor = administrator(
      actorUser,
      "Fiktiva Flersekundärorganisationen",
    );
    const client = await createFixtureClient(actor, "FLERSEKUNDÄR-01");

    await assign(actor, client.id, primaryStaff.id, "PRIMARY");
    await assign(actor, client.id, firstSecondary.id, "SECONDARY");
    await assign(actor, client.id, secondSecondary.id, "SECONDARY");

    expect(
      await prisma.assignment.count({
        where: { clientId: client.id, endedAt: null },
      }),
    ).toBe(3);
    expect(
      await prisma.assignment.count({
        where: {
          clientId: client.id,
          endedAt: null,
          responsibility: AssignmentResponsibility.PRIMARY,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.assignment.count({
        where: {
          clientId: client.id,
          endedAt: null,
          responsibility: AssignmentResponsibility.SECONDARY,
        },
      }),
    ).toBe(2);
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({ status: ClientStatus.ACTIVE });
    for (const staff of [firstSecondary, secondSecondary]) {
      expect(
        await findAccessibleClientForUser(
          client.id,
          applicationUser(staff, actor.organisationName),
        ),
      ).not.toBeNull();
    }
  });

  it("denies cross-Organisation Client list and detail access", async () => {
    const firstOrganisationId = await createOrganisation(
      "Fiktiva Första Isoleringsorganisationen",
    );
    const secondOrganisationId = await createOrganisation(
      "Fiktiva Andra Isoleringsorganisationen",
    );
    const firstAdministratorUser = await createUser(
      firstOrganisationId,
      UserRole.ADMINISTRATOR,
      "Första isoleringsadministratör",
    );
    const secondAdministratorUser = await createUser(
      secondOrganisationId,
      UserRole.ADMINISTRATOR,
      "Andra isoleringsadministratör",
    );
    const firstStaff = await createUser(
      firstOrganisationId,
      UserRole.STAFF_MEMBER,
      "Första isoleringsmedarbetare",
    );
    const firstActor = administrator(
      firstAdministratorUser,
      "Fiktiva Första Isoleringsorganisationen",
    );
    const secondActor = administrator(
      secondAdministratorUser,
      "Fiktiva Andra Isoleringsorganisationen",
    );
    const firstClient = await createFixtureClient(firstActor, "ISOLERING-A");
    const secondClient = await createFixtureClient(secondActor, "ISOLERING-B");
    await assign(firstActor, firstClient.id, firstStaff.id, "PRIMARY");
    const firstStaffUser = applicationUser(
      firstStaff,
      firstActor.organisationName,
    );

    expect((await listClientsInternal(firstActor)).map(({ id }) => id)).toEqual(
      [firstClient.id],
    );
    expect(
      (await listClientsInternal(firstStaffUser)).map(({ id }) => id),
    ).toEqual([firstClient.id]);
    expect(
      await findAccessibleClientForUser(secondClient.id, firstActor),
    ).toBeNull();
    expect(
      await findAccessibleClientForUser(secondClient.id, firstStaffUser),
    ).toBeNull();
    const unavailableId = randomUUID();
    expect(
      await findAccessibleClientForUser(unavailableId, firstActor),
    ).toBeNull();
    expect(
      await findAccessibleClientForUser(unavailableId, firstStaffUser),
    ).toBeNull();
  });

  it("serializes concurrent primary, duplicate, and end attempts with coherent audit outcomes", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Samtidighetsorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Samtidighetsadministratör",
    );
    const firstStaff = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Första samtidiga",
    );
    const secondStaff = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Andra samtidiga",
    );
    const actor = administrator(
      actorUser,
      "Fiktiva Samtidighetsorganisationen",
    );
    const client = await createFixtureClient(actor, "SAMTIDIG-01");
    const primaryOperationIds = [
      generateAuditOperationId(),
      generateAuditOperationId(),
    ];
    const primaryAttempts = await Promise.allSettled([
      createAssignmentForTest(
        {
          operationId: primaryOperationIds[0],
          clientId: client.id,
          staffUserId: firstStaff.id,
          responsibility: "PRIMARY",
        },
        actor,
        {},
      ),
      createAssignmentForTest(
        {
          operationId: primaryOperationIds[1],
          clientId: client.id,
          staffUserId: secondStaff.id,
          responsibility: "PRIMARY",
        },
        actor,
        {},
      ),
    ]);
    expect(
      primaryAttempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.assignment.count({
        where: {
          clientId: client.id,
          responsibility: AssignmentResponsibility.PRIMARY,
          endedAt: null,
        },
      }),
    ).toBe(1);

    const primary = await prisma.assignment.findFirstOrThrow({
      where: {
        clientId: client.id,
        responsibility: AssignmentResponsibility.PRIMARY,
        endedAt: null,
      },
    });
    const duplicateStaff =
      primary.staffUserId === firstStaff.id ? secondStaff : firstStaff;
    const duplicateOperationIds = [
      generateAuditOperationId(),
      generateAuditOperationId(),
    ];
    const duplicateAttempts = await Promise.allSettled(
      duplicateOperationIds.map((operationId) =>
        createAssignmentForTest(
          {
            operationId,
            clientId: client.id,
            staffUserId: duplicateStaff.id,
            responsibility: "SECONDARY",
          },
          actor,
          {},
        ),
      ),
    );
    expect(
      duplicateAttempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.assignment.count({
        where: {
          clientId: client.id,
          staffUserId: duplicateStaff.id,
          endedAt: null,
        },
      }),
    ).toBe(1);

    const endOperationIds = [
      generateAuditOperationId(),
      generateAuditOperationId(),
    ];
    const endAttempts = await Promise.allSettled(
      endOperationIds.map((operationId) =>
        endAssignmentForTest(
          { operationId, assignmentId: primary.id },
          actor,
          {},
        ),
      ),
    );
    expect(
      endAttempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      (await prisma.assignment.findUniqueOrThrow({ where: { id: primary.id } }))
        .endedAt,
    ).not.toBeNull();
    const outcomes = await prisma.auditEvent.findMany({
      where: {
        operationId: {
          in: [
            ...primaryOperationIds,
            ...duplicateOperationIds,
            ...endOperationIds,
          ],
        },
        type: "OUTCOME",
      },
      select: { result: true },
    });
    expect(
      outcomes.filter(({ result }) => result === "SUCCEEDED"),
    ).toHaveLength(3);
    expect(outcomes.filter(({ result }) => result === "FAILED")).toHaveLength(
      3,
    );
  });

  it("rolls back protected mutation changes before recording FAILED", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Återställningsorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Återställningsadministratör",
    );
    const actor = administrator(
      actorUser,
      "Fiktiva Återställningsorganisationen",
    );
    const operationId = generateAuditOperationId();

    await expect(
      createClientForTest(
        {
          operationId,
          firstName: "Fiktiv",
          lastName: "Återställd",
          personIdentifier: "ÅTERSTÄLL-01",
          category: "Fiktiv kategori",
        },
        actor,
        {
          afterBusinessMutation: () => {
            throw new Error("Fictional forced rollback");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    expect(await prisma.client.count({ where: { organisationId } })).toBe(0);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });
});
