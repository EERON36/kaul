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
import {
  beginMonthlyReportReplacementForTest,
  createMonthlyReportDraftForTest,
  listMonthlyReportsForTest,
  saveMonthlyReportDraftForTest,
  signMonthlyReportDraftForTest,
} from "./monthly-report.test-support";
import { MonthlyReportError } from "./monthly-report-internal";

const organisationIds = new Set<string>();

function actor(
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    organisationId: string;
    professionalTitle: string;
  },
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

async function createUser(
  organisationId: string,
  role: UserRole,
  label: string,
) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      organisationId,
      name: `Fiktiv ${label}`,
      email: `${id}@example.test`,
      role,
      professionalTitle: `Fiktiv titel ${label}`,
      mustChangePassword: false,
      banned: false,
    },
  });
}

async function createFixture() {
  const organisationId = randomUUID();
  const organisationName = `Fiktiv rapportorganisation ${organisationId}`;
  organisationIds.add(organisationId);
  await prisma.organisation.create({
    data: { id: organisationId, name: organisationName },
  });
  const [administratorUser, firstStaffUser, secondStaffUser, unassignedUser] =
    await Promise.all([
      createUser(organisationId, UserRole.ADMINISTRATOR, "administratör"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "första personal"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "andra personal"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "utan uppdrag"),
    ]);
  const client = await prisma.client.create({
    data: {
      id: randomUUID(),
      organisationId,
      firstName: "Fiktiv",
      lastName: "Rapportklient",
      personIdentifier: `RAPPORT-${randomUUID()}`,
      category: "ADULT",
      status: ClientStatus.ACTIVE,
    },
  });
  await prisma.assignment.createMany({
    data: [
      {
        id: randomUUID(),
        organisationId,
        clientId: client.id,
        staffUserId: firstStaffUser.id,
        responsibility: AssignmentResponsibility.PRIMARY,
        createdByUserId: administratorUser.id,
      },
      {
        id: randomUUID(),
        organisationId,
        clientId: client.id,
        staffUserId: secondStaffUser.id,
        responsibility: AssignmentResponsibility.SECONDARY,
        createdByUserId: administratorUser.id,
      },
    ],
  });
  return {
    client,
    administrator: actor(administratorUser, organisationName),
    firstStaff: actor(firstStaffUser, organisationName),
    secondStaff: actor(secondStaffUser, organisationName),
    unassigned: actor(unassignedUser, organisationName),
  };
}

async function cleanupFixtures() {
  const ids = [...organisationIds];
  organisationIds.clear();
  if (ids.length === 0) return;

  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      'ALTER TABLE "monthlyReport" DISABLE TRIGGER USER',
    );
    try {
      await transaction.monthlyReport.deleteMany({
        where: { organisationId: { in: ids } },
      });
    } finally {
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "monthlyReport" ENABLE TRIGGER USER',
      );
    }
    await transaction.assignment.deleteMany({
      where: { organisationId: { in: ids } },
    });
    await transaction.client.deleteMany({
      where: { organisationId: { in: ids } },
    });
    await transaction.session.deleteMany({
      where: { user: { organisationId: { in: ids } } },
    });
    await transaction.account.deleteMany({
      where: { user: { organisationId: { in: ids } } },
    });
    await transaction.user.deleteMany({
      where: { organisationId: { in: ids } },
    });
    await transaction.organisation.deleteMany({ where: { id: { in: ids } } });
  });
}

afterEach(cleanupFixtures);

const populatedSections = {
  healthContent: "Fiktiv hälsotext.",
  educationOccupationContent: "",
  emotionsBehaviorContent: "",
  socialRelationsContent: "Fiktiv relationstext.",
  dailyLivingIndependenceContent: "",
  otherContent: "",
} as const;

describe("Monthly Reports with PostgreSQL", () => {
  it("shares one optimistic draft, signs atomically, and preserves linked replacements", async () => {
    const fixture = await createFixture();
    const first = await createMonthlyReportDraftForTest(
      {
        clientId: fixture.client.id,
        calendarYear: 2026,
        calendarMonth: 8,
      },
      fixture.firstStaff,
    );
    const reopened = await createMonthlyReportDraftForTest(
      {
        clientId: fixture.client.id,
        calendarYear: 2026,
        calendarMonth: 8,
      },
      fixture.secondStaff,
    );
    expect(reopened).toMatchObject({ created: false });
    expect(reopened.draft.id).toBe(first.draft.id);

    const saved = await saveMonthlyReportDraftForTest(
      {
        monthlyReportId: first.draft.id,
        expectedVersion: first.draft.version,
        ...populatedSections,
      },
      fixture.secondStaff,
    );
    expect(saved).toMatchObject({
      status: "DRAFT",
      version: 2,
      createdByUserId: fixture.firstStaff.userId,
      updatedByUserId: fixture.secondStaff.userId,
    });
    await expect(
      saveMonthlyReportDraftForTest(
        {
          monthlyReportId: first.draft.id,
          expectedVersion: 1,
          ...populatedSections,
        },
        fixture.firstStaff,
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });

    const operationId = generateAuditOperationId();
    const signed = await signMonthlyReportDraftForTest(
      {
        operationId,
        monthlyReportId: saved.id,
        expectedVersion: saved.version,
      },
      fixture.secondStaff,
    );
    expect(signed).toMatchObject({
      status: "SIGNED",
      signerUserId: fixture.secondStaff.userId,
      signerName: fixture.secondStaff.name,
      revision: 1,
    });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({
      result: "SUCCEEDED",
      resolvedTargetId: signed.id,
    });
    await expect(
      prisma.monthlyReport.update({
        where: { id: signed.id },
        data: { healthContent: "Otillåten ändring" },
      }),
    ).rejects.toThrow();

    const replacement = await beginMonthlyReportReplacementForTest(
      { monthlyReportId: signed.id },
      fixture.firstStaff,
    );
    expect(replacement.draft).toMatchObject({
      revision: 2,
      replacesReportId: signed.id,
      healthContent: signed.healthContent,
    });
    const replacementOperationId = generateAuditOperationId();
    const replacementSigned = await signMonthlyReportDraftForTest(
      {
        operationId: replacementOperationId,
        monthlyReportId: replacement.draft.id,
        expectedVersion: replacement.draft.version,
      },
      fixture.firstStaff,
    );
    expect(replacementSigned.status).toBe("SIGNED");
    const history = await listMonthlyReportsForTest(
      { clientId: fixture.client.id },
      fixture.firstStaff,
    );
    expect(history.map(({ revision }) => revision)).toEqual([2, 1]);
  });

  it("fails closed for an unassigned user and for cross-organisation report identifiers", async () => {
    const fixture = await createFixture();
    await expect(
      createMonthlyReportDraftForTest(
        {
          clientId: fixture.client.id,
          calendarYear: 2026,
          calendarMonth: 9,
        },
        fixture.unassigned,
      ),
    ).rejects.toEqual(new MonthlyReportError("TARGET_UNAVAILABLE"));

    const secondFixture = await createFixture();
    const report = await createMonthlyReportDraftForTest(
      {
        clientId: fixture.client.id,
        calendarYear: 2026,
        calendarMonth: 9,
      },
      fixture.firstStaff,
    );
    await expect(
      saveMonthlyReportDraftForTest(
        {
          monthlyReportId: report.draft.id,
          expectedVersion: report.draft.version,
          ...populatedSections,
        },
        secondFixture.administrator,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
  });
});
