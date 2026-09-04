import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  AssignmentResponsibility,
  ClientStatus,
  UserRole,
  type Prisma,
} from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { generateAuditOperationId } from "../audit/audit";
import type { ApplicationUser } from "../authentication/guards";
import type { AdministratorUser } from "../users/authorization";
import {
  archiveClientForTest,
  endAssignmentForTest,
} from "../clients/clients.test-support";
import {
  beginMonthlyReportReplacementForTest,
  createMonthlyReportDraftForTest,
  getMonthlyReportForTest,
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
    administrator: actor(
      administratorUser,
      organisationName,
    ) as AdministratorUser,
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

async function createSignedReport(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  calendarMonth = 8,
) {
  const { draft } = await createMonthlyReportDraftForTest(
    { clientId: fixture.client.id, calendarYear: 2026, calendarMonth },
    fixture.firstStaff,
  );
  const saved = await saveMonthlyReportDraftForTest(
    {
      monthlyReportId: draft.id,
      expectedVersion: draft.version,
      ...populatedSections,
    },
    fixture.firstStaff,
  );
  return signMonthlyReportDraftForTest(
    {
      monthlyReportId: saved.id,
      expectedVersion: saved.version,
      operationId: generateAuditOperationId(),
    },
    fixture.firstStaff,
  );
}

async function archiveFixtureClient(
  fixture: Awaited<ReturnType<typeof createFixture>>,
) {
  const assignments = await prisma.assignment.findMany({
    where: { clientId: fixture.client.id, endedAt: null },
    select: { id: true },
  });
  for (const assignment of assignments) {
    await endAssignmentForTest(
      { operationId: generateAuditOperationId(), assignmentId: assignment.id },
      fixture.administrator,
      {},
    );
  }
  await archiveClientForTest(
    { operationId: generateAuditOperationId(), clientId: fixture.client.id },
    fixture.administrator,
    {},
  );
}

async function expectReportSqlRejected(
  mutation: (transaction: Prisma.TransactionClient) => Promise<unknown>,
  message: string,
) {
  await expect(
    prisma.$transaction(async (transaction) => {
      await mutation(transaction);
      await transaction.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
      // Roll back even if a guard regresses, including a successful TRUNCATE.
      throw new Error("A forbidden report mutation unexpectedly succeeded.");
    }),
  ).rejects.toThrow(message);
}

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
    for (const deniedActor of [
      fixture.unassigned,
      secondFixture.administrator,
    ]) {
      await expect(
        listMonthlyReportsForTest({ clientId: fixture.client.id }, deniedActor),
      ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
      await expect(
        getMonthlyReportForTest(
          { monthlyReportId: report.draft.id },
          deniedActor,
        ),
      ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    }
  });

  it("does not disclose reports when the assignment ends after list preflight", async () => {
    const fixture = await createFixture();
    await createSignedReport(fixture);
    await createMonthlyReportDraftForTest(
      { clientId: fixture.client.id, calendarYear: 2026, calendarMonth: 9 },
      fixture.firstStaff,
    );
    const assignment = await prisma.assignment.findFirstOrThrow({
      where: {
        clientId: fixture.client.id,
        staffUserId: fixture.secondStaff.userId,
        endedAt: null,
      },
      select: { id: true },
    });
    const reports = await listMonthlyReportsForTest(
      { clientId: fixture.client.id },
      fixture.secondStaff,
      {
        beforeReportQuery: async () => {
          await endAssignmentForTest(
            {
              operationId: generateAuditOperationId(),
              assignmentId: assignment.id,
            },
            fixture.administrator,
            {},
          );
        },
      },
    );
    expect(reports.map(({ id }) => id)).toEqual([]);
  });

  it("excludes drafts when the Client is archived after list preflight", async () => {
    const fixture = await createFixture();
    const signed = await createSignedReport(fixture);
    const { draft } = await createMonthlyReportDraftForTest(
      { clientId: fixture.client.id, calendarYear: 2026, calendarMonth: 9 },
      fixture.firstStaff,
    );
    const reports = await listMonthlyReportsForTest(
      { clientId: fixture.client.id },
      fixture.administrator,
      { beforeReportQuery: () => archiveFixtureClient(fixture) },
    );
    expect(reports.map(({ id }) => id)).toEqual([signed.id]);
    await expect(
      getMonthlyReportForTest(
        { monthlyReportId: signed.id },
        fixture.administrator,
      ),
    ).resolves.toMatchObject({ id: signed.id, status: "SIGNED" });
    await expect(
      getMonthlyReportForTest(
        { monthlyReportId: draft.id },
        fixture.administrator,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      listMonthlyReportsForTest(
        { clientId: fixture.client.id },
        fixture.firstStaff,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      getMonthlyReportForTest(
        { monthlyReportId: signed.id },
        fixture.firstStaff,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
  });

  it.each([
    { banned: true },
    { mustChangePassword: true },
    { role: UserRole.STAFF_MEMBER },
  ])(
    "revalidates the actor before list and detail reads: %j",
    async (actorChange) => {
      const fixture = await createFixture();
      const signed = await createSignedReport(fixture);
      await prisma.user.update({
        where: { id: fixture.administrator.userId },
        data: actorChange,
      });
      await expect(
        listMonthlyReportsForTest(
          { clientId: fixture.client.id },
          fixture.administrator,
        ),
      ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
      await expect(
        getMonthlyReportForTest(
          { monthlyReportId: signed.id },
          fixture.administrator,
        ),
      ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    },
  );

  it("reopens only the requested signed report's direct replacement draft", async () => {
    const fixture = await createFixture();
    const signed = await createSignedReport(fixture);
    const first = await beginMonthlyReportReplacementForTest(
      { monthlyReportId: signed.id },
      fixture.firstStaff,
    );
    const reopened = await beginMonthlyReportReplacementForTest(
      { monthlyReportId: signed.id },
      fixture.secondStaff,
    );
    expect(reopened.created).toBe(false);
    expect(reopened.draft.id).toBe(first.draft.id);
    const replacement = await signMonthlyReportDraftForTest(
      {
        monthlyReportId: first.draft.id,
        expectedVersion: first.draft.version,
        operationId: generateAuditOperationId(),
      },
      fixture.secondStaff,
    );
    const next = await beginMonthlyReportReplacementForTest(
      { monthlyReportId: replacement.id },
      fixture.firstStaff,
    );
    expect(next.draft.replacesReportId).toBe(replacement.id);
    await expect(
      beginMonthlyReportReplacementForTest(
        { monthlyReportId: signed.id },
        fixture.firstStaff,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    expect(
      await prisma.monthlyReport.count({
        where: { clientId: fixture.client.id },
      }),
    ).toBe(3);
  });

  it("shares one replacement draft when two authorised users request it concurrently", async () => {
    const fixture = await createFixture();
    const signed = await createSignedReport(fixture);
    const results = await Promise.all([
      beginMonthlyReportReplacementForTest(
        { monthlyReportId: signed.id },
        fixture.firstStaff,
      ),
      beginMonthlyReportReplacementForTest(
        { monthlyReportId: signed.id },
        fixture.secondStaff,
      ),
    ]);
    expect(results.map(({ created }) => created).sort()).toEqual([false, true]);
    expect(new Set(results.map(({ draft }) => draft.id)).size).toBe(1);
    expect(
      await prisma.monthlyReport.count({
        where: { replacesReportId: signed.id },
      }),
    ).toBe(1);
  });

  it("rejects signed deletion and report truncation through direct SQL", async () => {
    const fixture = await createFixture();
    const signed = await createSignedReport(fixture);
    await expectReportSqlRejected(
      (transaction) =>
        transaction.$executeRaw`DELETE FROM "monthlyReport" WHERE "id" = ${signed.id}::uuid`,
      "Signed monthly reports are immutable.",
    );
    await expectReportSqlRejected(
      (transaction) => transaction.$executeRaw`TRUNCATE TABLE "monthlyReport"`,
      "Monthly reports cannot be truncated.",
    );
    await expect(
      prisma.monthlyReport.findUniqueOrThrow({ where: { id: signed.id } }),
    ).resolves.toMatchObject({
      status: "SIGNED",
      healthContent: populatedSections.healthContent,
    });
  });

  it("rejects direct signing without successful audit evidence and preserves the draft", async () => {
    const fixture = await createFixture();
    const { draft } = await createMonthlyReportDraftForTest(
      { clientId: fixture.client.id, calendarYear: 2026, calendarMonth: 8 },
      fixture.firstStaff,
    );
    const saved = await saveMonthlyReportDraftForTest(
      {
        monthlyReportId: draft.id,
        expectedVersion: draft.version,
        ...populatedSections,
      },
      fixture.firstStaff,
    );
    await expectReportSqlRejected(
      (transaction) => transaction.$executeRaw`
        UPDATE "monthlyReport"
        SET "status" = 'SIGNED', "version" = "version" + 1,
            "signedAt" = ${new Date()},
            "signerUserId" = ${fixture.firstStaff.userId},
            "signerName" = ${fixture.firstStaff.name},
            "signerProfessionalTitle" = ${fixture.firstStaff.professionalTitle},
            "signerRole" = 'STAFF_MEMBER'
        WHERE "id" = ${saved.id}::uuid
      `,
      "Signed monthly reports require successful audit evidence.",
    );
    await expect(
      prisma.monthlyReport.findUniqueOrThrow({ where: { id: saved.id } }),
    ).resolves.toMatchObject({
      status: "DRAFT",
      version: saved.version,
      signedAt: null,
    });
  });

  it("rejects skipped, unsigned, and cross-month predecessors through direct SQL", async () => {
    const fixture = await createFixture();
    const signed = await createSignedReport(fixture);
    const { draft } = await createMonthlyReportDraftForTest(
      { clientId: fixture.client.id, calendarYear: 2026, calendarMonth: 9 },
      fixture.firstStaff,
    );
    for (const invalid of [
      { predecessor: signed.id, month: 8, revision: 3 },
      { predecessor: draft.id, month: 9, revision: 2 },
      { predecessor: signed.id, month: 10, revision: 2 },
    ]) {
      await expectReportSqlRejected(
        (transaction) => transaction.$executeRaw`
          INSERT INTO "monthlyReport" (
            "id", "reference", "organisationId", "clientId", "calendarYear", "calendarMonth",
            "revision", "replacesReportId", "createdByUserId", "updatedByUserId", "updatedAt"
          ) VALUES (
            ${randomUUID()}::uuid, ${`MRP-${randomUUID().toUpperCase()}`},
            ${fixture.administrator.organisationId}, ${fixture.client.id}::uuid, 2026, ${invalid.month},
            ${invalid.revision}, ${invalid.predecessor}::uuid,
            ${fixture.firstStaff.userId}, ${fixture.firstStaff.userId}, ${new Date()}
          )
        `,
        "A monthly report replacement must extend the signed lineage.",
      );
    }
    expect(
      await prisma.monthlyReport.count({
        where: { clientId: fixture.client.id },
      }),
    ).toBe(2);
  });
});
