import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  AssignmentResponsibility,
  ClientStatus,
  UserRole,
} from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { ApplicationUser } from "../authentication/guards";
import { clientSearchInputSchema } from "./client-input";
import { searchClientsInternal, type ClientListItem } from "./clients-internal";

const organisationIds = new Set<string>();

async function cleanupFixtures(): Promise<void> {
  if (organisationIds.size === 0) return;
  const ids = [...organisationIds];
  await prisma.assignment.deleteMany({
    where: { organisationId: { in: ids } },
  });
  await prisma.client.deleteMany({ where: { organisationId: { in: ids } } });
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
  organisation: Readonly<{ id: string; name: string }>,
  role: UserRole,
  label: string,
): Promise<ApplicationUser> {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: `Fiktiv ${label}`,
      email: `${label.toLowerCase().replaceAll(" ", ".")}.${randomUUID()}@example.test`,
      role,
      banned: false,
      organisationId: organisation.id,
      professionalTitle: "Fiktiv yrkestitel",
      mustChangePassword: false,
    },
  });

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organisationId: organisation.id,
    organisationName: organisation.name,
    professionalTitle: user.professionalTitle,
    mustChangePassword: false,
    credentialState: "APPLICATION_ALLOWED",
  };
}

async function createClient(
  organisationId: string,
  input: Readonly<{
    firstName: string;
    lastName: string;
    personIdentifier: string;
    status?: ClientStatus;
    category?: string;
  }>,
) {
  const status = input.status ?? ClientStatus.ACTIVE;
  return prisma.client.create({
    data: {
      id: randomUUID(),
      organisationId,
      firstName: input.firstName,
      lastName: input.lastName,
      personIdentifier: input.personIdentifier,
      category: input.category ?? "ADULT",
      status,
      archivedAt: status === ClientStatus.ARCHIVED ? new Date() : null,
    },
  });
}

async function assignClient(
  client: Readonly<{ id: string; organisationId: string }>,
  staffUserId: string,
  createdByUserId: string,
  responsibility: AssignmentResponsibility,
  endedAt: Date | null = null,
) {
  return prisma.assignment.create({
    data: {
      id: randomUUID(),
      organisationId: client.organisationId,
      clientId: client.id,
      staffUserId,
      responsibility,
      startedAt:
        endedAt === null ? undefined : new Date(endedAt.getTime() - 1_000),
      endedAt,
      createdByUserId,
    },
  });
}

function search(user: ApplicationUser, input: string) {
  return searchClientsInternal(user, clientSearchInputSchema.parse(input));
}

function clientIds(clients: readonly ClientListItem[]): string[] {
  return clients.map(({ id }) => id);
}

describe("permission-aware Client search with PostgreSQL", () => {
  it("searches only the Administrator's ordinary organisation-local Clients", async () => {
    const ownOrganisation = await createOrganisation(
      "Fiktiva Sökorganisationen",
    );
    const otherOrganisation = await createOrganisation(
      "Fiktiva Främmande Sökorganisationen",
    );
    const administrator = await createUser(
      ownOrganisation,
      UserRole.ADMINISTRATOR,
      "Sökadministratör",
    );

    const swedishClient = await createClient(ownOrganisation.id, {
      firstName: "Åsa",
      lastName: "Ärlig Öberg",
      personIdentifier: "REF-É-01",
      category: "ADULT",
    });
    const inactiveClient = await createClient(ownOrganisation.id, {
      firstName: "Ingrid",
      lastName: "Lindström",
      personIdentifier: "INAKTIV-01",
      status: ClientStatus.INACTIVE,
      category: "YOUTH",
    });
    const nfcClient = await createClient(ownOrganisation.id, {
      firstName: "E\u0301lodie",
      lastName: "Nordin",
      personIdentifier: "NFC-01",
    });
    const percentClient = await createClient(ownOrganisation.id, {
      firstName: "Procent%Namn",
      lastName: "Literal",
      personIdentifier: "LITERAL-PERCENT",
    });
    const underscoreClient = await createClient(ownOrganisation.id, {
      firstName: "Under_streck",
      lastName: "Literal",
      personIdentifier: "LITERAL-UNDERSCORE",
    });
    const backslashClient = await createClient(ownOrganisation.id, {
      firstName: "Bak\\streck",
      lastName: "Literal",
      personIdentifier: "LITERAL-BACKSLASH",
    });
    await createClient(ownOrganisation.id, {
      firstName: "Arkiverad",
      lastName: "Hemlig",
      personIdentifier: "ARKIVERAD-01",
      status: ClientStatus.ARCHIVED,
    });
    await createClient(otherOrganisation.id, {
      firstName: "Främmande",
      lastName: "Hemlig",
      personIdentifier: "FRÄMMANDE-01",
    });

    expect(clientIds(await search(administrator, "ÅS"))).toEqual([
      swedishClient.id,
    ]);
    expect(clientIds(await search(administrator, "öbe"))).toEqual([
      swedishClient.id,
    ]);
    expect(
      clientIds(await search(administrator, "öberg\u2003åsa äRLIG")),
    ).toEqual([swedishClient.id]);
    expect(clientIds(await search(administrator, "ingr"))).toEqual([
      inactiveClient.id,
    ]);
    expect(
      clientIds(await search(administrator, "  ref-e\u0301-01  ")),
    ).toEqual([swedishClient.id]);
    expect(clientIds(await search(administrator, "e\u0301LO"))).toEqual([
      nfcClient.id,
    ]);
    expect(clientIds(await search(administrator, "%"))).toEqual([
      percentClient.id,
    ]);
    expect(clientIds(await search(administrator, "_"))).toEqual([
      underscoreClient.id,
    ]);
    expect(clientIds(await search(administrator, "\\"))).toEqual([
      backslashClient.id,
    ]);
    await expect(search(administrator, "REF-É")).resolves.toEqual([]);
    await expect(search(administrator, "Vuxna")).resolves.toEqual([]);
    await expect(search(administrator, "Arkiverad Hemlig")).resolves.toEqual(
      [],
    );
    await expect(search(administrator, "ARKIVERAD-01")).resolves.toEqual([]);
    await expect(search(administrator, "Främmande Hemlig")).resolves.toEqual(
      [],
    );
    await expect(search(administrator, "FRÄMMANDE-01")).resolves.toEqual([]);

    const result = await search(administrator, "Åsa");
    expect(Object.keys(result[0] ?? {}).sort()).toEqual(
      [
        "category",
        "firstName",
        "id",
        "lastName",
        "personIdentifier",
        "status",
      ].sort(),
    );
    expect(JSON.stringify(result)).not.toContain("assignments");
    expect(JSON.stringify(result)).not.toContain("count");
  });

  it("returns only active Clients with a current primary or secondary Staff Assignment", async () => {
    const organisation = await createOrganisation(
      "Fiktiva Personalens Sökorganisation",
    );
    const otherOrganisation = await createOrganisation(
      "Fiktiva Andra Personalorganisationen",
    );
    const administrator = await createUser(
      organisation,
      UserRole.ADMINISTRATOR,
      "Personaladministratör",
    );
    const staff = await createUser(
      organisation,
      UserRole.STAFF_MEMBER,
      "Sökmedarbetare",
    );
    const primary = await createClient(organisation.id, {
      firstName: "Primär",
      lastName: "Synlig",
      personIdentifier: "PRIMÄR-SYNLIG",
    });
    const secondary = await createClient(organisation.id, {
      firstName: "Sekundär",
      lastName: "Synlig",
      personIdentifier: "SEKUNDÄR-SYNLIG",
    });
    const unassigned = await createClient(organisation.id, {
      firstName: "Otilldelad",
      lastName: "Hemlig",
      personIdentifier: "OTILLDELAD-HEMLIG",
    });
    const ended = await createClient(organisation.id, {
      firstName: "Avslutad",
      lastName: "Hemlig",
      personIdentifier: "AVSLUTAD-HEMLIG",
    });
    const inactive = await createClient(organisation.id, {
      firstName: "Inaktiv",
      lastName: "Hemlig",
      personIdentifier: "INAKTIV-HEMLIG",
      status: ClientStatus.INACTIVE,
    });
    const archived = await createClient(organisation.id, {
      firstName: "Arkiverad",
      lastName: "Hemlig",
      personIdentifier: "ARKIVERAD-HEMLIG",
      status: ClientStatus.ARCHIVED,
    });
    await createClient(otherOrganisation.id, {
      firstName: "Främmande",
      lastName: "Hemlig",
      personIdentifier: "FRÄMMANDE-HEMLIG",
    });

    await assignClient(
      primary,
      staff.userId,
      administrator.userId,
      AssignmentResponsibility.PRIMARY,
    );
    await assignClient(
      secondary,
      staff.userId,
      administrator.userId,
      AssignmentResponsibility.SECONDARY,
    );
    await assignClient(
      ended,
      staff.userId,
      administrator.userId,
      AssignmentResponsibility.PRIMARY,
      new Date(),
    );
    await assignClient(
      inactive,
      staff.userId,
      administrator.userId,
      AssignmentResponsibility.PRIMARY,
    );
    await assignClient(
      archived,
      staff.userId,
      administrator.userId,
      AssignmentResponsibility.PRIMARY,
    );

    expect(clientIds(await search(staff, "Synlig"))).toEqual([
      primary.id,
      secondary.id,
    ]);
    expect(clientIds(await search(staff, "PRIMÄR-SYNLIG"))).toEqual([
      primary.id,
    ]);

    for (const query of [
      "Otilldelad Hemlig",
      "tilldelad",
      "OTILLDELAD-HEMLIG",
      "Avslutad Hemlig",
      "AVSLUTAD-HEMLIG",
      "Inaktiv Hemlig",
      "INAKTIV-HEMLIG",
      "Arkiverad Hemlig",
      "ARKIVERAD-HEMLIG",
      "Främmande Hemlig",
      "FRÄMMANDE-HEMLIG",
    ]) {
      const result = await search(staff, query);
      expect(result).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(unassigned.personIdentifier);
    }
  });

  it("returns the deterministic first 50 matches and restores the ordinary list for empty input", async () => {
    const organisation = await createOrganisation(
      "Fiktiva Begränsade Sökorganisationen",
    );
    const administrator = await createUser(
      organisation,
      UserRole.ADMINISTRATOR,
      "Begränsningsadministratör",
    );
    const clients = Array.from({ length: 55 }, (_, index) => ({
      id: randomUUID(),
      organisationId: organisation.id,
      firstName: "Sökbar",
      lastName: `Efternamn ${String(index).padStart(2, "0")}`,
      personIdentifier: `GRÄNS-${String(54 - index).padStart(2, "0")}`,
      category: index % 2 === 0 ? "ADULT" : "YOUTH",
      status: ClientStatus.INACTIVE,
      archivedAt: null,
    }));
    await prisma.client.createMany({ data: clients });

    const result = await search(administrator, "sÖKbAr");

    expect(result).toHaveLength(50);
    expect(result.map(({ lastName }) => lastName)).toEqual(
      clients.slice(0, 50).map(({ lastName }) => lastName),
    );
    expect(result[0]?.personIdentifier).toBe("GRÄNS-54");
    expect(result[49]?.personIdentifier).toBe("GRÄNS-05");

    const ordinaryList = await search(administrator, " \t\n ");
    expect(ordinaryList).toHaveLength(55);
    expect(ordinaryList.map(({ lastName }) => lastName)).toEqual(
      clients.map(({ lastName }) => lastName),
    );
  });
});
