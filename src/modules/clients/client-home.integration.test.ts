import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { ClientStatus, UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { generateAuditOperationId } from "../audit/audit";
import type { ApplicationUser } from "../authentication/guards";
import type { AdministratorUser } from "../users/authorization";
import { findAccessibleClientForUser } from "./client-access";
import { clientSearchInputSchema } from "./client-input";
import {
  createAssignmentForTest,
  createClientForTest,
  endAssignmentForTest,
} from "./clients.test-support";
import {
  listAssignedClientsForHomeInternal,
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
  return { id, name };
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
      professionalTitle: "Fiktiv behandlare",
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

async function createClient(
  actor: AdministratorUser,
  reference: string,
  firstName = "Fiktiv",
  lastName = "Hemklient",
) {
  return createClientForTest(
    {
      operationId: generateAuditOperationId(),
      firstName,
      lastName,
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

describe("Staff assigned-Client Home with PostgreSQL", () => {
  it("follows active primary and secondary Assignment lifecycle without cross-Organisation disclosure", async () => {
    const organisation = await createOrganisation("Fiktiva Hemorganisationen");
    const otherOrganisation = await createOrganisation(
      "Fiktiva Andra Hemorganisationen",
    );
    const administratorUser = await createUser(
      organisation.id,
      UserRole.ADMINISTRATOR,
      "Hemadministratör",
    );
    const otherAdministratorUser = await createUser(
      otherOrganisation.id,
      UserRole.ADMINISTRATOR,
      "Annan hemadministratör",
    );
    const primaryUser = await createUser(
      organisation.id,
      UserRole.STAFF_MEMBER,
      "Primär hemmedarbetare",
    );
    const secondaryUser = await createUser(
      organisation.id,
      UserRole.STAFF_MEMBER,
      "Sekundär hemmedarbetare",
    );
    const replacementPrimaryUser = await createUser(
      organisation.id,
      UserRole.STAFF_MEMBER,
      "Ny primär hemmedarbetare",
    );
    const unassignedUser = await createUser(
      organisation.id,
      UserRole.STAFF_MEMBER,
      "Otilldelad hemmedarbetare",
    );
    const otherStaffUser = await createUser(
      otherOrganisation.id,
      UserRole.STAFF_MEMBER,
      "Annan hemmedarbetare",
    );
    const actor = administrator(administratorUser, organisation.name);
    const otherActor = administrator(
      otherAdministratorUser,
      otherOrganisation.name,
    );
    const primary = applicationUser(primaryUser, organisation.name);
    const secondary = applicationUser(secondaryUser, organisation.name);
    const replacementPrimary = applicationUser(
      replacementPrimaryUser,
      organisation.name,
    );
    const unassigned = applicationUser(unassignedUser, organisation.name);
    const otherStaff = applicationUser(otherStaffUser, otherOrganisation.name);

    const client = await createClient(actor, "HEM-AKTIV-01");
    const primaryAssignment = await assign(
      actor,
      client.id,
      primaryUser.id,
      "PRIMARY",
    );
    await assign(actor, client.id, secondaryUser.id, "SECONDARY");

    const inactiveClient = await createClient(actor, "HEM-INAKTIV-01");
    await prisma.client.create({
      data: {
        id: randomUUID(),
        organisationId: organisation.id,
        firstName: "Fiktiv",
        lastName: "Arkivklient",
        personIdentifier: "HEM-ARKIVERAD-01",
        category: "YOUTH",
        status: ClientStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });
    const otherClient = await createClient(
      otherActor,
      "HEM-ANNAN-ORG-01",
      "Fiktiv",
      "Annan organisationsklient",
    );
    await assign(otherActor, otherClient.id, otherStaffUser.id, "PRIMARY");

    await expect(listAssignedClientsForHomeInternal(primary)).resolves.toEqual([
      {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        personIdentifier: client.personIdentifier,
        category: client.category,
        responsibility: "PRIMARY",
      },
    ]);
    await expect(
      listAssignedClientsForHomeInternal(secondary),
    ).resolves.toMatchObject([{ id: client.id, responsibility: "SECONDARY" }]);
    await expect(
      listAssignedClientsForHomeInternal(unassigned),
    ).resolves.toEqual([]);
    await expect(
      listAssignedClientsForHomeInternal(otherStaff),
    ).resolves.toEqual([
      expect.objectContaining({
        id: otherClient.id,
        responsibility: "PRIMARY",
      }),
    ]);
    await expect(listAssignedClientsForHomeInternal(actor)).resolves.toEqual(
      [],
    );
    expect(
      (await listAssignedClientsForHomeInternal(primary)).map(({ id }) => id),
    ).not.toContain(inactiveClient.id);

    const secondaryAssignment = await prisma.assignment.findFirstOrThrow({
      where: { clientId: client.id, staffUserId: secondaryUser.id },
    });
    await endAssignmentForTest(
      {
        operationId: generateAuditOperationId(),
        assignmentId: secondaryAssignment.id,
      },
      actor,
      {},
    );
    await expect(
      listAssignedClientsForHomeInternal(secondary),
    ).resolves.toEqual([]);

    await assign(actor, client.id, secondaryUser.id, "SECONDARY");
    await endAssignmentForTest(
      {
        operationId: generateAuditOperationId(),
        assignmentId: primaryAssignment.id,
      },
      actor,
      {},
    );
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({ status: ClientStatus.INACTIVE });
    await expect(listAssignedClientsForHomeInternal(primary)).resolves.toEqual(
      [],
    );
    await expect(
      listAssignedClientsForHomeInternal(secondary),
    ).resolves.toEqual([]);

    await assign(actor, client.id, replacementPrimaryUser.id, "PRIMARY");
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({ status: ClientStatus.ACTIVE });
    await expect(
      listAssignedClientsForHomeInternal(replacementPrimary),
    ).resolves.toMatchObject([{ id: client.id, responsibility: "PRIMARY" }]);
    await expect(
      listAssignedClientsForHomeInternal(secondary),
    ).resolves.toMatchObject([{ id: client.id, responsibility: "SECONDARY" }]);
  });

  it("returns same-Organisation primary responsibility only to Administrator list and search results", async () => {
    const organisation = await createOrganisation(
      "Fiktiva Listorienteringsorganisationen",
    );
    const otherOrganisation = await createOrganisation(
      "Fiktiva Andra Listorienteringsorganisationen",
    );
    const administratorUser = await createUser(
      organisation.id,
      UserRole.ADMINISTRATOR,
      "Listadministratör",
    );
    const otherAdministratorUser = await createUser(
      otherOrganisation.id,
      UserRole.ADMINISTRATOR,
      "Annan listadministratör",
    );
    const primaryUser = await createUser(
      organisation.id,
      UserRole.STAFF_MEMBER,
      "Listansvarig",
    );
    const otherPrimaryUser = await createUser(
      otherOrganisation.id,
      UserRole.STAFF_MEMBER,
      "Hemlig listansvarig",
    );
    const actor = administrator(administratorUser, organisation.name);
    const otherActor = administrator(
      otherAdministratorUser,
      otherOrganisation.name,
    );
    const staff = applicationUser(primaryUser, organisation.name);
    const activeClient = await createClient(
      actor,
      "LIST-ORIENTERING-AKTIV",
      "Aktiv",
      "Orienteringsklient",
    );
    const inactiveClient = await createClient(
      actor,
      "LIST-ORIENTERING-INAKTIV",
      "Inaktiv",
      "Orienteringsklient",
    );
    const otherClient = await createClient(
      otherActor,
      "LIST-ORIENTERING-HEMLIG",
      "Hemlig",
      "Orienteringsklient",
    );
    await assign(actor, activeClient.id, primaryUser.id, "PRIMARY");
    await assign(otherActor, otherClient.id, otherPrimaryUser.id, "PRIMARY");

    const administratorClients = await listClientsInternal(actor);
    expect(administratorClients).toEqual([
      expect.objectContaining({
        id: activeClient.id,
        primaryStaff: {
          name: primaryUser.name,
          professionalTitle: primaryUser.professionalTitle,
        },
      }),
      expect.objectContaining({ id: inactiveClient.id, primaryStaff: null }),
    ]);
    expect(JSON.stringify(administratorClients)).not.toContain(
      otherPrimaryUser.name,
    );

    const administratorSearch = await searchClientsInternal(
      actor,
      clientSearchInputSchema.parse("orienteringsklient"),
    );
    expect(administratorSearch).toHaveLength(2);
    expect(administratorSearch[0]).toHaveProperty("primaryStaff");

    const staffClients = await listClientsInternal(staff);
    expect(staffClients).toHaveLength(1);
    expect(Object.hasOwn(staffClients[0] ?? {}, "primaryStaff")).toBe(false);
    const staffSearch = await searchClientsInternal(
      staff,
      clientSearchInputSchema.parse("orienteringsklient"),
    );
    expect(staffSearch).toHaveLength(1);
    expect(Object.hasOwn(staffSearch[0] ?? {}, "primaryStaff")).toBe(false);
    await expect(
      findAccessibleClientForUser(otherClient.id, staff),
    ).resolves.toBeNull();
  });
});
