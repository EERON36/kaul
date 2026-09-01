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
  updateClientForTest,
} from "./clients.test-support";
import {
  getClientEditingDetailsInternal,
  getClientSensitiveSummaryInternal,
  listClientsInternal,
  searchClientsInternal,
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
      category: "ADULT",
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
  it("isolates Personnummer from ordinary projections while preserving expanded Client fields", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva känsliga klientorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Administratör känslig klient",
    );
    const admin = administrator(
      actorUser,
      "Fiktiva känsliga klientorganisationen",
    );
    const created = await createClientForTest(
      {
        operationId: generateAuditOperationId(),
        firstName: "Fiktiv",
        lastName: "Klient",
        personIdentifier: "FIKTIV-SENSITIV-01",
        personalIdentityNumber: "20000101-1234",
        placingUnit: "Fiktiv placerande enhet",
        legalBasis: "SoL",
        responsibleSocialWorkerName: "Fiktiv socialsekreterare",
        responsibleSocialWorkerPhone: "070-000 00 00",
        responsibleSocialWorkerEmail: "socialsekreterare@example.test",
        category: "ADULT",
      },
      admin,
      {},
    );
    expect("personalIdentityNumber" in created).toBe(false);

    const [listed] = await listClientsInternal(admin);
    const [searched] = await searchClientsInternal(admin, "FIKTIV-SENSITIV-01");
    expect("personalIdentityNumber" in listed).toBe(false);
    expect("personalIdentityNumber" in searched).toBe(false);
    await expect(
      getClientSensitiveSummaryInternal(admin, created.id),
    ).resolves.toEqual({ hasPersonalIdentityNumber: true });
    await expect(
      getClientEditingDetailsInternal(admin, created.id),
    ).resolves.toMatchObject({
      personalIdentityNumber: "20000101-1234",
      placingUnit: "Fiktiv placerande enhet",
      legalBasis: "SoL",
      responsibleSocialWorkerName: "Fiktiv socialsekreterare",
      responsibleSocialWorkerPhone: "070-000 00 00",
      responsibleSocialWorkerEmail: "socialsekreterare@example.test",
    });

    const otherOrganisationId = await createOrganisation(
      "Fiktiva andra klientorganisationen",
    );
    const otherAdminUser = await createUser(
      otherOrganisationId,
      UserRole.ADMINISTRATOR,
      "Andra administratören",
    );
    const otherAdmin = administrator(
      otherAdminUser,
      "Fiktiva andra klientorganisationen",
    );
    await expect(
      getClientSensitiveSummaryInternal(otherAdmin, created.id),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
  });

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
        category: " ADULT ",
      },
      actor,
      {},
    );

    expect(created).toMatchObject({
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: "FIKTIV-É-01",
      category: "ADULT",
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
          category: "ADULT",
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
          category: "ADULT",
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

  it("lets an Administrator edit only Client-owned editable fields with immutable audit evidence", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Redigeringsorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Redigeringsadministratör",
    );
    const staffUser = await createUser(
      organisationId,
      UserRole.STAFF_MEMBER,
      "Redigeringsmedarbetare",
    );
    const actor = administrator(actorUser, "Fiktiva Redigeringsorganisationen");
    const client = await createFixtureClient(actor, "REDIGERA-01");
    const assignment = await assign(actor, client.id, staffUser.id, "PRIMARY");
    const before = await prisma.client.findUniqueOrThrow({
      where: { id: client.id },
    });
    const operationId = generateAuditOperationId();

    await expect(
      updateClientForTest(
        {
          operationId,
          clientId: client.id,
          firstName: " Uppdaterad ",
          lastName: " Testklient ",
          personIdentifier: " ändrad-é-01 ",
          category: " YOUTH ",
        },
        actor,
        {},
      ),
    ).resolves.toMatchObject({
      changed: true,
      client: {
        id: client.id,
        firstName: "Uppdaterad",
        lastName: "Testklient",
        personIdentifier: "ÄNDRAD-É-01",
        category: "YOUTH",
        status: ClientStatus.ACTIVE,
      },
    });

    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({
      organisationId,
      status: before.status,
      archivedAt: before.archivedAt,
      createdAt: before.createdAt,
    });
    await expect(
      prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } }),
    ).resolves.toMatchObject({
      clientId: client.id,
      staffUserId: staffUser.id,
      responsibility: AssignmentResponsibility.PRIMARY,
      endedAt: null,
    });
    await expect(
      prisma.auditOperation.findUniqueOrThrow({ where: { id: operationId } }),
    ).resolves.toMatchObject({
      organisationId,
      actorUserId: actor.userId,
      action: "CLIENT_UPDATED",
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
    expect(
      JSON.stringify(
        await prisma.auditOperation.findUniqueOrThrow({
          where: { id: operationId },
        }),
      ),
    ).not.toContain("ÄNDRAD-É-01");
  });

  it("denies Staff and cross-Organisation Client edits without leaking the target", async () => {
    const firstOrganisationId = await createOrganisation(
      "Fiktiva Redigeringsgränsen",
    );
    const secondOrganisationId = await createOrganisation(
      "Fiktiva Främmande Redigeringsgränsen",
    );
    const firstAdminUser = await createUser(
      firstOrganisationId,
      UserRole.ADMINISTRATOR,
      "Första redigeringsadministratör",
    );
    const secondAdminUser = await createUser(
      secondOrganisationId,
      UserRole.ADMINISTRATOR,
      "Andra redigeringsadministratör",
    );
    const staffUser = await createUser(
      firstOrganisationId,
      UserRole.STAFF_MEMBER,
      "Otillåten redigeringsmedarbetare",
    );
    const firstActor = administrator(
      firstAdminUser,
      "Fiktiva Redigeringsgränsen",
    );
    const secondActor = administrator(
      secondAdminUser,
      "Fiktiva Främmande Redigeringsgränsen",
    );
    const foreignClient = await createFixtureClient(secondActor, "HEMLIG-01");
    const staffActor = applicationUser(
      staffUser,
      firstActor.organisationName,
    ) as AdministratorUser;
    const original = await prisma.client.findUniqueOrThrow({
      where: { id: foreignClient.id },
    });

    for (const [attemptActor, clientId] of [
      [firstActor, foreignClient.id],
      [staffActor, foreignClient.id],
      [firstActor, randomUUID()],
    ] as const) {
      const operationId = generateAuditOperationId();
      await expect(
        updateClientForTest(
          {
            operationId,
            clientId,
            firstName: "Otillåten",
            lastName: "Ändring",
            personIdentifier: "OTILLÅTEN-01",
            category: "YOUTH",
          },
          attemptActor,
          {},
        ),
      ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
      expect(
        await prisma.auditOperation.findUnique({ where: { id: operationId } }),
      ).toBeNull();
    }
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: foreignClient.id } }),
    ).resolves.toEqual(original);
  });

  it("rejects a same-Organisation reference conflict without partial mutation or false success", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Referenskonfliktorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Referenskonfliktadministratör",
    );
    const actor = administrator(
      actorUser,
      "Fiktiva Referenskonfliktorganisationen",
    );
    const firstClient = await createFixtureClient(actor, "REFERENS-A");
    const secondClient = await createFixtureClient(actor, "REFERENS-B");
    const operationId = generateAuditOperationId();

    await expect(
      updateClientForTest(
        {
          operationId,
          clientId: secondClient.id,
          firstName: "Får inte",
          lastName: "Sparas",
          personIdentifier: " referens-a ",
          category: "YOUTH",
        },
        actor,
        {},
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER" });
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: secondClient.id } }),
    ).resolves.toMatchObject(secondClient);
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: firstClient.id } }),
    ).resolves.toMatchObject(firstClient);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("allows equivalent references in different Organisations and avoids no-op audit evidence", async () => {
    const firstOrganisationId = await createOrganisation(
      "Fiktiva Första Referensorganisationen",
    );
    const secondOrganisationId = await createOrganisation(
      "Fiktiva Andra Referensorganisationen",
    );
    const firstAdminUser = await createUser(
      firstOrganisationId,
      UserRole.ADMINISTRATOR,
      "Första referensadministratör",
    );
    const secondAdminUser = await createUser(
      secondOrganisationId,
      UserRole.ADMINISTRATOR,
      "Andra referensadministratör",
    );
    const firstActor = administrator(
      firstAdminUser,
      "Fiktiva Första Referensorganisationen",
    );
    const secondActor = administrator(
      secondAdminUser,
      "Fiktiva Andra Referensorganisationen",
    );
    await createFixtureClient(firstActor, "DELAD-REFERENS");
    const secondClient = await createFixtureClient(
      secondActor,
      "ANNAN-REFERENS",
    );
    const updateOperationId = generateAuditOperationId();

    await expect(
      updateClientForTest(
        {
          operationId: updateOperationId,
          clientId: secondClient.id,
          firstName: secondClient.firstName,
          lastName: secondClient.lastName,
          personIdentifier: "delad-referens",
          category: secondClient.category,
        },
        secondActor,
        {},
      ),
    ).resolves.toMatchObject({ changed: true });

    const noOpOperationId = generateAuditOperationId();
    await expect(
      updateClientForTest(
        {
          operationId: noOpOperationId,
          clientId: secondClient.id,
          firstName: secondClient.firstName,
          lastName: secondClient.lastName,
          personIdentifier: " delad-referens ",
          category: secondClient.category,
        },
        secondActor,
        {},
      ),
    ).resolves.toMatchObject({ changed: false });
    expect(
      await prisma.auditOperation.findUnique({
        where: { id: noOpOperationId },
      }),
    ).toBeNull();
  });

  it("preserves database uniqueness and truthful audit outcomes for concurrent conflicting edits", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Samtidiga Redigeringsorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Samtidig redigeringsadministratör",
    );
    const actor = administrator(
      actorUser,
      "Fiktiva Samtidiga Redigeringsorganisationen",
    );
    const clients = await Promise.all([
      createFixtureClient(actor, "SAMTIDIG-REDIGERA-A"),
      createFixtureClient(actor, "SAMTIDIG-REDIGERA-B"),
    ]);
    const operationIds = [
      generateAuditOperationId(),
      generateAuditOperationId(),
    ];

    const attempts = await Promise.allSettled(
      clients.map((client, index) =>
        updateClientForTest(
          {
            operationId: operationIds[index],
            clientId: client.id,
            firstName: `Samtidig ${index + 1}`,
            lastName: "Klient",
            personIdentifier: "GEMENSAM-REFERENS",
            category: index === 0 ? "ADULT" : "YOUTH",
          },
          actor,
          {},
        ),
      ),
    );

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.client.count({
        where: { organisationId, personIdentifier: "GEMENSAM-REFERENS" },
      }),
    ).toBe(1);
    const outcomes = await prisma.auditEvent.findMany({
      where: {
        operationId: { in: operationIds },
        type: "OUTCOME",
      },
      select: { result: true },
    });
    expect(
      outcomes.filter(({ result }) => result === "SUCCEEDED"),
    ).toHaveLength(1);
    expect(outcomes.filter(({ result }) => result === "FAILED")).toHaveLength(
      1,
    );
  });

  it("rolls back a Client edit when audit-coupled mutation work fails", async () => {
    const organisationId = await createOrganisation(
      "Fiktiva Redigeringsåterställningsorganisationen",
    );
    const actorUser = await createUser(
      organisationId,
      UserRole.ADMINISTRATOR,
      "Redigeringsåterställningsadministratör",
    );
    const actor = administrator(
      actorUser,
      "Fiktiva Redigeringsåterställningsorganisationen",
    );
    const client = await createFixtureClient(actor, "REDIGERINGSÅTERSTÄLL-01");
    const operationId = generateAuditOperationId();

    await expect(
      updateClientForTest(
        {
          operationId,
          clientId: client.id,
          firstName: "Ska",
          lastName: "Återställas",
          personIdentifier: "REDIGERINGSÅTERSTÄLL-02",
          category: "YOUTH",
        },
        actor,
        {
          afterBusinessMutation: () => {
            throw new Error("Fictional forced update rollback");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject(client);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });
});
