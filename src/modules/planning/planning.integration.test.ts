import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  AssignmentResponsibility,
  ClientStatus,
  FollowUpStatus,
  GoalStatus,
  UserRole,
} from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { generateAuditOperationId } from "../audit/audit";
import type { ApplicationUser } from "../authentication/guards";
import {
  archiveClientForTest,
  endAssignmentForTest,
} from "../clients/clients.test-support";
import {
  createJournalDraftForTest,
  getSignedJournalEntryForTest,
  listAvailableJournalGoalsForTest,
  replaceJournalDraftGoalsForTest,
  signJournalDraftForTest,
} from "../journal/journal.test-support";
import type { AdministratorUser } from "../users/authorization";
import {
  archiveGoalForTest,
  cancelFollowUpForTest,
  completeFollowUpForTest,
  completeGoalForTest,
  createFollowUpForTest,
  createGoalForTest,
  getFollowUpForTest,
  listEligibleResponsibleUsersForTest,
  listGoalsForTest,
  listOwnFollowUpsForHomeForTest,
  pauseGoalForTest,
  reassignFollowUpForTest,
  resumeGoalForTest,
  updateFollowUpForTest,
  updateGoalForTest,
} from "./planning.test-support";

const FIXTURE_PREFIX = "Fiktiv M4-organisation ";
const fixtureOrganisationIds = new Set<string>();

type FixtureUser = Awaited<ReturnType<typeof createUser>>;

function applicationUser(
  user: FixtureUser,
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

function asAdministrator(
  user: FixtureUser,
  organisationName: string,
): AdministratorUser {
  return applicationUser(user, organisationName) as AdministratorUser;
}

async function createUser(
  organisationId: string,
  role: UserRole,
  label: string,
  banned = false,
) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      name: `Fiktiv ${label}`,
      email: `${id}@example.test`,
      role,
      organisationId,
      professionalTitle: `Fiktiv titel ${label}`,
      mustChangePassword: false,
      banned,
    },
  });
}

async function createFixture() {
  const organisationId = randomUUID();
  const otherOrganisationId = randomUUID();
  const organisationName = `${FIXTURE_PREFIX}${organisationId}`;
  const otherOrganisationName = `${FIXTURE_PREFIX}${otherOrganisationId}`;
  fixtureOrganisationIds.add(organisationId);
  fixtureOrganisationIds.add(otherOrganisationId);
  await prisma.organisation.createMany({
    data: [
      { id: organisationId, name: organisationName },
      { id: otherOrganisationId, name: otherOrganisationName },
    ],
  });

  const [administratorUser, staffUser, peerUser, unassignedUser, inactiveUser] =
    await Promise.all([
      createUser(organisationId, UserRole.ADMINISTRATOR, "administratör"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "ansvarig"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "kollega"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "utan uppdrag"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "inaktiv", true),
    ]);
  const [otherAdministratorUser, otherStaffUser] = await Promise.all([
    createUser(
      otherOrganisationId,
      UserRole.ADMINISTRATOR,
      "annan administratör",
    ),
    createUser(otherOrganisationId, UserRole.STAFF_MEMBER, "annan personal"),
  ]);

  const [firstClient, secondClient, archivedClient, otherClient] =
    await Promise.all([
      prisma.client.create({
        data: {
          id: randomUUID(),
          organisationId,
          firstName: "Fiktiv",
          lastName: "Klient Ett",
          personIdentifier: `M4-A-${randomUUID()}`,
          category: "ADULT",
          status: ClientStatus.ACTIVE,
        },
      }),
      prisma.client.create({
        data: {
          id: randomUUID(),
          organisationId,
          firstName: "Fiktiv",
          lastName: "Klient Två",
          personIdentifier: `M4-B-${randomUUID()}`,
          category: "YOUTH",
          status: ClientStatus.ACTIVE,
        },
      }),
      prisma.client.create({
        data: {
          id: randomUUID(),
          organisationId,
          firstName: "Fiktiv",
          lastName: "Arkiverad",
          personIdentifier: `M4-ARCHIVE-${randomUUID()}`,
          category: "ADULT",
          status: ClientStatus.ARCHIVED,
          archivedAt: new Date("2026-08-01T10:00:00.000Z"),
        },
      }),
      prisma.client.create({
        data: {
          id: randomUUID(),
          organisationId: otherOrganisationId,
          firstName: "Fiktiv",
          lastName: "Annan organisation",
          personIdentifier: `M4-OTHER-${randomUUID()}`,
          category: "ADULT",
          status: ClientStatus.ACTIVE,
        },
      }),
    ]);

  await prisma.assignment.createMany({
    data: [
      {
        id: randomUUID(),
        organisationId,
        clientId: firstClient.id,
        staffUserId: staffUser.id,
        responsibility: AssignmentResponsibility.PRIMARY,
        createdByUserId: administratorUser.id,
      },
      {
        id: randomUUID(),
        organisationId,
        clientId: firstClient.id,
        staffUserId: peerUser.id,
        responsibility: AssignmentResponsibility.SECONDARY,
        createdByUserId: administratorUser.id,
      },
      {
        id: randomUUID(),
        organisationId,
        clientId: secondClient.id,
        staffUserId: staffUser.id,
        responsibility: AssignmentResponsibility.PRIMARY,
        createdByUserId: administratorUser.id,
      },
      {
        id: randomUUID(),
        organisationId: otherOrganisationId,
        clientId: otherClient.id,
        staffUserId: otherStaffUser.id,
        responsibility: AssignmentResponsibility.PRIMARY,
        createdByUserId: otherAdministratorUser.id,
      },
    ],
  });

  const archivedGoal = await prisma.goal.create({
    data: {
      id: randomUUID(),
      organisationId,
      clientId: archivedClient.id,
      title: "Fiktivt historiskt mål",
      status: GoalStatus.ACTIVE,
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      createdByUserId: administratorUser.id,
      version: 1,
    },
  });

  return {
    organisationId,
    organisationName,
    administrator: asAdministrator(administratorUser, organisationName),
    staff: applicationUser(staffUser, organisationName),
    peer: applicationUser(peerUser, organisationName),
    unassigned: applicationUser(unassignedUser, organisationName),
    inactive: applicationUser(inactiveUser, organisationName),
    otherAdministrator: asAdministrator(
      otherAdministratorUser,
      otherOrganisationName,
    ),
    otherStaff: applicationUser(otherStaffUser, otherOrganisationName),
    firstClient,
    secondClient,
    archivedClient,
    otherClient,
    archivedGoal,
  };
}

async function cleanupFixtureOrganisations(ids: readonly string[]) {
  if (ids.length === 0) return;
  await prisma.$transaction(async (transaction) => {
    const protectedTables = [
      "journalGoalReference",
      "journalEntry",
      "followUpResponsibilityHistory",
      "followUp",
      "goal",
    ];
    for (const table of protectedTables) {
      await transaction.$executeRawUnsafe(
        `ALTER TABLE "${table}" DISABLE TRIGGER USER`,
      );
    }
    try {
      await transaction.journalGoalReference.deleteMany({
        where: { organisationId: { in: [...ids] } },
      });
      await transaction.journalEntry.deleteMany({
        where: { organisationId: { in: [...ids] } },
      });
      await transaction.followUpResponsibilityHistory.deleteMany({
        where: { organisationId: { in: [...ids] } },
      });
      await transaction.followUp.deleteMany({
        where: { organisationId: { in: [...ids] } },
      });
      await transaction.goal.deleteMany({
        where: { organisationId: { in: [...ids] } },
      });
    } finally {
      for (const table of [...protectedTables].reverse()) {
        await transaction.$executeRawUnsafe(
          `ALTER TABLE "${table}" ENABLE TRIGGER USER`,
        );
      }
    }
    await transaction.assignment.deleteMany({
      where: { organisationId: { in: [...ids] } },
    });
    await transaction.session.deleteMany({
      where: { user: { organisationId: { in: [...ids] } } },
    });
    await transaction.account.deleteMany({
      where: { user: { organisationId: { in: [...ids] } } },
    });
    await transaction.client.deleteMany({
      where: { organisationId: { in: [...ids] } },
    });
    await transaction.user.deleteMany({
      where: { organisationId: { in: [...ids] } },
    });
    await transaction.organisation.deleteMany({
      where: { id: { in: [...ids] } },
    });
  });
}

beforeAll(async () => {
  const stale = await prisma.organisation.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  await cleanupFixtureOrganisations(stale.map(({ id }) => id));
});

afterEach(async () => {
  const ids = [...fixtureOrganisationIds];
  fixtureOrganisationIds.clear();
  await cleanupFixtureOrganisations(ids);
});

function goalInput(clientId: string, title = "Fiktivt mål") {
  return {
    clientId,
    title,
    description: "Fiktiv målbeskrivning.",
    startDate: "2026-08-13",
    targetDate: "2026-09-13",
  } as const;
}

function followUpInput(
  clientId: string,
  responsibleUserId: string,
  goalId: string | null = null,
  title = "Fiktiv uppföljning",
) {
  return {
    clientId,
    title,
    description: "Fiktiv uppföljningsbeskrivning.",
    dueDate: "2026-08-14",
    dueTime: null,
    responsibleUserId,
    goalId,
  } as const;
}

async function expectPlanningCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

function deferred() {
  return Promise.withResolvers<void>();
}

async function waitForClientMutationLockWaiter(clientId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [lock] = await prisma.$queryRaw<Array<{ waiting: bigint }>>`
      SELECT count(*) AS "waiting"
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND classid::bigint = 1129607912
        AND objid::bigint = (hashtext(${clientId})::bigint & 4294967295)
        AND NOT granted
    `;
    if (lock && Number(lock.waiting) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the Planning mutation lock waiter.");
}

describe("Milestone 4 planning foundation", () => {
  it("reuses current Client access and keeps archived planning read-only", async () => {
    const fixture = await createFixture();
    const goal = await createGoalForTest(
      goalInput(fixture.firstClient.id),
      fixture.staff,
    );
    expect(goal.createdByUser.id).toBe(fixture.staff.userId);
    expect(
      await listGoalsForTest(
        { clientId: fixture.firstClient.id },
        fixture.staff,
      ),
    ).toHaveLength(1);

    await expectPlanningCode(
      listGoalsForTest(
        { clientId: fixture.firstClient.id },
        fixture.unassigned,
      ),
      "TARGET_UNAVAILABLE",
    );
    await prisma.assignment.updateMany({
      where: {
        organisationId: fixture.organisationId,
        clientId: fixture.firstClient.id,
        staffUserId: fixture.staff.userId,
        endedAt: null,
      },
      data: { endedAt: new Date() },
    });
    await expectPlanningCode(
      listGoalsForTest({ clientId: fixture.firstClient.id }, fixture.staff),
      "TARGET_UNAVAILABLE",
    );
    await expectPlanningCode(
      listGoalsForTest(
        { clientId: fixture.firstClient.id },
        fixture.otherAdministrator,
      ),
      "TARGET_UNAVAILABLE",
    );
    expect(
      await listGoalsForTest(
        { clientId: fixture.archivedClient.id },
        fixture.administrator,
      ),
    ).toEqual([expect.objectContaining({ id: fixture.archivedGoal.id })]);
    await expectPlanningCode(
      createGoalForTest(
        goalInput(fixture.archivedClient.id),
        fixture.administrator,
      ),
      "TARGET_UNAVAILABLE",
    );
    await expectPlanningCode(
      listGoalsForTest({ clientId: fixture.archivedClient.id }, fixture.staff),
      "TARGET_UNAVAILABLE",
    );
  });

  it("enforces Goal lifecycle, stale writes, retention, and exact terminal audit actions", async () => {
    const fixture = await createFixture();
    const created = await createGoalForTest(
      goalInput(fixture.firstClient.id),
      fixture.staff,
    );
    const paused = await pauseGoalForTest(
      { goalId: created.id, expectedVersion: created.version },
      fixture.staff,
    );
    expect(paused.goal.status).toBe(GoalStatus.PAUSED);
    await expectPlanningCode(
      updateGoalForTest(
        {
          goalId: created.id,
          expectedVersion: created.version,
          title: "För gammal ändring",
          description: null,
          startDate: "2026-08-13",
          targetDate: null,
        },
        fixture.staff,
      ),
      "STALE_VERSION",
    );
    const resumed = await resumeGoalForTest(
      { goalId: created.id, expectedVersion: paused.goal.version },
      fixture.staff,
    );
    const operationId = generateAuditOperationId();
    const completed = await completeGoalForTest(
      {
        operationId,
        goalId: created.id,
        expectedVersion: resumed.goal.version,
      },
      fixture.staff,
    );
    expect(completed.status).toBe(GoalStatus.COMPLETED);
    await expectPlanningCode(
      resumeGoalForTest(
        { goalId: created.id, expectedVersion: completed.version },
        fixture.staff,
      ),
      "INVALID_STATE",
    );
    await expect(
      prisma.goal.delete({ where: { id: created.id } }),
    ).rejects.toThrow();

    const operations = await prisma.auditOperation.findMany({
      where: { targetId: created.id },
      include: { events: true },
    });
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      id: operationId,
      action: "GOAL_COMPLETED",
      targetType: "GOAL",
      actorUserId: fixture.staff.userId,
    });
    expect(operations[0]?.events).toEqual([
      expect.objectContaining({
        result: "SUCCEEDED",
        resolvedTargetId: created.id,
      }),
    ]);

    const archivedCandidate = await createGoalForTest(
      goalInput(fixture.firstClient.id, "Mål att arkivera"),
      fixture.staff,
    );
    const archived = await archiveGoalForTest(
      {
        operationId: generateAuditOperationId(),
        goalId: archivedCandidate.id,
        expectedVersion: archivedCandidate.version,
      },
      fixture.staff,
    );
    expect(archived.status).toBe(GoalStatus.ARCHIVED);
  });

  it("validates responsibility at selection but preserves it after access loss", async () => {
    const fixture = await createFixture();
    const eligible = await listEligibleResponsibleUsersForTest(
      { clientId: fixture.firstClient.id },
      fixture.staff,
    );
    expect(eligible.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        fixture.administrator.userId,
        fixture.staff.userId,
        fixture.peer.userId,
      ]),
    );
    expect(eligible.map(({ id }) => id)).not.toContain(
      fixture.unassigned.userId,
    );

    await expectPlanningCode(
      createFollowUpForTest(
        followUpInput(fixture.firstClient.id, fixture.unassigned.userId),
        fixture.staff,
      ),
      "INVALID_RESPONSIBLE_USER",
    );
    await expectPlanningCode(
      createFollowUpForTest(
        followUpInput(fixture.firstClient.id, fixture.inactive.userId),
        fixture.staff,
      ),
      "INVALID_RESPONSIBLE_USER",
    );
    await expectPlanningCode(
      createFollowUpForTest(
        followUpInput(fixture.firstClient.id, fixture.otherStaff.userId),
        fixture.staff,
      ),
      "INVALID_RESPONSIBLE_USER",
    );

    const followUp = await createFollowUpForTest(
      followUpInput(fixture.firstClient.id, fixture.peer.userId),
      fixture.staff,
    );
    await prisma.assignment.updateMany({
      where: {
        organisationId: fixture.organisationId,
        clientId: fixture.firstClient.id,
        staffUserId: fixture.peer.userId,
        endedAt: null,
      },
      data: { endedAt: new Date() },
    });
    await expectPlanningCode(
      getFollowUpForTest({ followUpId: followUp.id }, fixture.peer),
      "TARGET_UNAVAILABLE",
    );
    expect(
      await listOwnFollowUpsForHomeForTest(
        fixture.peer,
        new Date("2026-08-13T10:00:00.000Z"),
      ),
    ).toEqual([]);
    const retained = await getFollowUpForTest(
      { followUpId: followUp.id },
      fixture.administrator,
    );
    expect(retained).toMatchObject({
      responsibleUser: { id: fixture.peer.userId },
      responsibilityNeedsReassignment: true,
    });

    const reassignmentOperationId = generateAuditOperationId();
    const reassigned = await reassignFollowUpForTest(
      {
        operationId: reassignmentOperationId,
        followUpId: followUp.id,
        expectedVersion: retained.version,
        responsibleUserId: fixture.administrator.userId,
      },
      fixture.administrator,
    );
    expect(reassigned.followUp.responsibilityHistory).toEqual([
      expect.objectContaining({
        previousResponsibleUser: expect.objectContaining({
          id: fixture.peer.userId,
        }),
        newResponsibleUser: expect.objectContaining({
          id: fixture.administrator.userId,
        }),
        actorUser: expect.objectContaining({
          id: fixture.administrator.userId,
        }),
      }),
    ]);
    const historyId = reassigned.followUp.responsibilityHistory[0]?.id;
    expect(historyId).toBeDefined();
    await expect(
      prisma.followUpResponsibilityHistory.findUniqueOrThrow({
        where: { auditOperationId: reassignmentOperationId },
        select: {
          id: true,
          auditOperationId: true,
          previousResponsibleUserId: true,
          newResponsibleUserId: true,
          actorUserId: true,
          followUpVersion: true,
        },
      }),
    ).resolves.toEqual({
      id: reassignmentOperationId,
      auditOperationId: reassignmentOperationId,
      previousResponsibleUserId: fixture.peer.userId,
      newResponsibleUserId: fixture.administrator.userId,
      actorUserId: fixture.administrator.userId,
      followUpVersion: retained.version + 1,
    });
    const noChange = await reassignFollowUpForTest(
      {
        operationId: generateAuditOperationId(),
        followUpId: followUp.id,
        expectedVersion: reassigned.followUp.version,
        responsibleUserId: fixture.administrator.userId,
      },
      fixture.administrator,
    );
    expect(noChange.changed).toBe(false);
    expect(noChange.followUp.responsibilityHistory).toHaveLength(1);
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT set_config(
            'kaul.follow_up_reassignment_operation_id',
            ${reassignmentOperationId},
            true
          )
        `;
        await transaction.$executeRaw`
          UPDATE "followUp"
             SET "responsibleUserId" = ${fixture.staff.userId},
                 "version" = "version" + 1,
                 "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = ${followUp.id}::uuid
        `;
      }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        INSERT INTO "followUpResponsibilityHistory" (
          "id", "organisationId", "clientId", "followUpId",
          "previousResponsibleUserId", "newResponsibleUserId", "actorUserId",
          "followUpVersion", "auditOperationId"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${fixture.organisationId},
          ${fixture.firstClient.id}::uuid,
          ${followUp.id}::uuid,
          ${fixture.staff.userId},
          ${fixture.administrator.userId},
          ${fixture.administrator.userId},
          ${reassigned.followUp.version + 1},
          ${reassignmentOperationId}::uuid
        )
      `,
    ).rejects.toThrow();
    await expect(
      prisma.followUp.findUniqueOrThrow({ where: { id: followUp.id } }),
    ).resolves.toMatchObject({
      responsibleUserId: fixture.administrator.userId,
      version: reassigned.followUp.version,
    });
    expect(
      await prisma.followUpResponsibilityHistory.count({
        where: { followUpId: followUp.id },
      }),
    ).toBe(1);
    await expectPlanningCode(
      reassignFollowUpForTest(
        {
          operationId: generateAuditOperationId(),
          followUpId: followUp.id,
          expectedVersion: retained.version,
          responsibleUserId: fixture.staff.userId,
        },
        fixture.administrator,
      ),
      "STALE_VERSION",
    );
    expect(
      await prisma.auditOperation.count({
        where: { targetId: followUp.id, action: "FOLLOW_UP_REASSIGNED" },
      }),
    ).toBe(1);
    await expect(
      prisma.followUpResponsibilityHistory.delete({ where: { id: historyId } }),
    ).rejects.toThrow();
  });

  it("enforces Follow-up links, stale edits, terminal races, and no Journal side effect", async () => {
    const fixture = await createFixture();
    const goal = await createGoalForTest(
      goalInput(fixture.firstClient.id),
      fixture.staff,
    );
    const otherGoal = await createGoalForTest(
      goalInput(fixture.secondClient.id, "Annat klientmål"),
      fixture.staff,
    );
    await expectPlanningCode(
      createFollowUpForTest(
        followUpInput(
          fixture.firstClient.id,
          fixture.staff.userId,
          otherGoal.id,
        ),
        fixture.staff,
      ),
      "INVALID_GOAL_LINK",
    );
    const followUp = await createFollowUpForTest(
      followUpInput(fixture.firstClient.id, fixture.staff.userId, goal.id),
      fixture.staff,
    );
    const updated = await updateFollowUpForTest(
      {
        followUpId: followUp.id,
        expectedVersion: followUp.version,
        title: "Uppdaterad uppföljning",
        description: null,
        dueDate: "2026-08-15",
        dueTime: "14:30",
        goalId: goal.id,
      },
      fixture.staff,
    );
    await expectPlanningCode(
      updateFollowUpForTest(
        {
          followUpId: followUp.id,
          expectedVersion: followUp.version,
          title: "För gammal",
          description: null,
          dueDate: "2026-08-16",
          dueTime: null,
          goalId: goal.id,
        },
        fixture.staff,
      ),
      "STALE_VERSION",
    );

    const results = await Promise.allSettled([
      completeFollowUpForTest(
        {
          operationId: generateAuditOperationId(),
          followUpId: followUp.id,
          expectedVersion: updated.followUp.version,
        },
        fixture.staff,
      ),
      cancelFollowUpForTest(
        {
          operationId: generateAuditOperationId(),
          followUpId: followUp.id,
          expectedVersion: updated.followUp.version,
        },
        fixture.staff,
      ),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const terminal = await getFollowUpForTest(
      { followUpId: followUp.id },
      fixture.staff,
    );
    expect([FollowUpStatus.COMPLETED, FollowUpStatus.CANCELLED]).toContain(
      terminal.status,
    );
    await expectPlanningCode(
      updateFollowUpForTest(
        {
          followUpId: terminal.id,
          expectedVersion: terminal.version,
          title: "Otillåten terminal ändring",
          description: null,
          dueDate: "2026-08-17",
          dueTime: null,
          goalId: goal.id,
        },
        fixture.staff,
      ),
      "INVALID_STATE",
    );
    expect(
      await prisma.journalEntry.count({
        where: { organisationId: fixture.organisationId },
      }),
    ).toBe(0);
    await expect(
      prisma.followUp.delete({ where: { id: followUp.id } }),
    ).rejects.toThrow();
    expect(
      await prisma.auditEvent.count({
        where: {
          result: "SUCCEEDED",
          operation: { targetId: followUp.id },
        },
      }),
    ).toBe(1);
  });

  it("rejects combined reassignment and terminal transitions in raw SQL", async () => {
    const fixture = await createFixture();
    const [completeTarget, cancelTarget] = await Promise.all([
      createFollowUpForTest(
        followUpInput(fixture.firstClient.id, fixture.staff.userId),
        fixture.staff,
      ),
      createFollowUpForTest(
        followUpInput(
          fixture.firstClient.id,
          fixture.staff.userId,
          null,
          "Fiktiv uppföljning att avboka",
        ),
        fixture.staff,
      ),
    ]);

    await expect(
      prisma.$executeRaw`
        UPDATE "followUp"
           SET "responsibleUserId" = ${fixture.peer.userId},
               "status" = 'COMPLETED',
               "completedAt" = CURRENT_TIMESTAMP,
               "completedByUserId" = ${fixture.staff.userId},
               "version" = "version" + 1,
               "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ${completeTarget.id}::uuid
      `,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        UPDATE "followUp"
           SET "responsibleUserId" = ${fixture.peer.userId},
               "status" = 'CANCELLED',
               "cancelledAt" = CURRENT_TIMESTAMP,
               "cancelledByUserId" = ${fixture.staff.userId},
               "version" = "version" + 1,
               "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ${cancelTarget.id}::uuid
      `,
    ).rejects.toThrow();

    const rows = await prisma.followUp.findMany({
      where: { id: { in: [completeTarget.id, cancelTarget.id] } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        status: true,
        responsibleUserId: true,
        version: true,
      },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          id: completeTarget.id,
          status: FollowUpStatus.PLANNED,
          responsibleUserId: fixture.staff.userId,
          version: completeTarget.version,
        },
        {
          id: cancelTarget.id,
          status: FollowUpStatus.PLANNED,
          responsibleUserId: fixture.staff.userId,
          version: cancelTarget.version,
        },
      ]),
    );
    expect(
      await prisma.followUpResponsibilityHistory.count({
        where: { followUpId: { in: [completeTarget.id, cancelTarget.id] } },
      }),
    ).toBe(0);
  });

  it("serializes Assignment ending and Planning edits in both lock orders", async () => {
    const fixture = await createFixture();
    const firstGoal = await createGoalForTest(
      goalInput(fixture.firstClient.id, "Mål före uppdragsförlust"),
      fixture.staff,
    );
    const firstAssignment = await prisma.assignment.findFirstOrThrow({
      where: {
        organisationId: fixture.organisationId,
        clientId: fixture.firstClient.id,
        staffUserId: fixture.staff.userId,
        endedAt: null,
      },
      select: { id: true },
    });
    const assignmentEnded = deferred();
    const allowAssignmentCommit = deferred();
    const endingFirst = endAssignmentForTest(
      {
        operationId: generateAuditOperationId(),
        assignmentId: firstAssignment.id,
      },
      fixture.administrator,
      {
        afterBusinessMutation: async () => {
          assignmentEnded.resolve();
          await allowAssignmentCommit.promise;
        },
      },
    );
    await assignmentEnded.promise;
    const deniedEdit = updateGoalForTest(
      {
        goalId: firstGoal.id,
        expectedVersion: firstGoal.version,
        title: "Ska inte sparas efter uppdragsförlust",
        description: firstGoal.description,
        startDate: "2026-08-13",
        targetDate: "2026-09-13",
      },
      fixture.staff,
    );
    allowAssignmentCommit.resolve();
    await expect(endingFirst).resolves.toEqual({
      clientId: fixture.firstClient.id,
    });
    await expectPlanningCode(deniedEdit, "TARGET_UNAVAILABLE");
    await expect(
      prisma.goal.findUniqueOrThrow({ where: { id: firstGoal.id } }),
    ).resolves.toMatchObject({
      title: "Mål före uppdragsförlust",
      version: firstGoal.version,
    });

    const secondGoal = await createGoalForTest(
      goalInput(fixture.secondClient.id, "Mål som redigeras först"),
      fixture.staff,
    );
    const secondAssignment = await prisma.assignment.findFirstOrThrow({
      where: {
        organisationId: fixture.organisationId,
        clientId: fixture.secondClient.id,
        staffUserId: fixture.staff.userId,
        endedAt: null,
      },
      select: { id: true },
    });
    const goalMutated = deferred();
    const allowGoalCommit = deferred();
    const editFirst = updateGoalForTest(
      {
        goalId: secondGoal.id,
        expectedVersion: secondGoal.version,
        title: "Mål sparat före uppdragsförlust",
        description: secondGoal.description,
        startDate: "2026-08-13",
        targetDate: "2026-09-13",
      },
      fixture.staff,
      {
        afterBusinessMutation: async () => {
          goalMutated.resolve();
          await allowGoalCommit.promise;
        },
      },
    );
    await goalMutated.promise;
    const endingSecond = endAssignmentForTest(
      {
        operationId: generateAuditOperationId(),
        assignmentId: secondAssignment.id,
      },
      fixture.administrator,
      {},
    );
    allowGoalCommit.resolve();
    await expect(editFirst).resolves.toMatchObject({
      changed: true,
      goal: { title: "Mål sparat före uppdragsförlust", version: 2 },
    });
    await expect(endingSecond).resolves.toEqual({
      clientId: fixture.secondClient.id,
    });
    expect(
      await prisma.followUpResponsibilityHistory.count({
        where: { organisationId: fixture.organisationId },
      }),
    ).toBe(0);
    expect(
      await prisma.auditOperation.count({
        where: {
          organisationId: fixture.organisationId,
          targetId: { in: [firstGoal.id, secondGoal.id] },
          action: { startsWith: "GOAL_" },
        },
      }),
    ).toBe(0);
  });

  it("serializes Client archival and Planning edits in both lock orders", async () => {
    const fixture = await createFixture();
    const createInactiveClientAndGoal = async (label: string) => {
      const client = await prisma.client.create({
        data: {
          id: randomUUID(),
          organisationId: fixture.organisationId,
          firstName: "Fiktiv",
          lastName: label,
          personIdentifier: `M4-ARKIV-${randomUUID()}`,
          category: "ADULT",
          status: ClientStatus.INACTIVE,
        },
      });
      const goal = await createGoalForTest(
        goalInput(client.id, `Mål ${label}`),
        fixture.administrator,
      );
      return { client, goal };
    };

    const archiveWinner = await createInactiveClientAndGoal("Arkiv vinner");
    const archived = deferred();
    const allowArchiveCommit = deferred();
    const archiveFirst = archiveClientForTest(
      {
        operationId: generateAuditOperationId(),
        clientId: archiveWinner.client.id,
      },
      fixture.administrator,
      {
        afterBusinessMutation: async () => {
          archived.resolve();
          await allowArchiveCommit.promise;
        },
      },
    );
    await archived.promise;
    const deniedEdit = updateGoalForTest(
      {
        goalId: archiveWinner.goal.id,
        expectedVersion: archiveWinner.goal.version,
        title: "Ska inte sparas efter arkivering",
        description: archiveWinner.goal.description,
        startDate: "2026-08-13",
        targetDate: "2026-09-13",
      },
      fixture.administrator,
    );
    allowArchiveCommit.resolve();
    await expect(archiveFirst).resolves.toMatchObject({
      clientId: archiveWinner.client.id,
    });
    await expectPlanningCode(deniedEdit, "TARGET_UNAVAILABLE");
    await expect(
      prisma.goal.findUniqueOrThrow({ where: { id: archiveWinner.goal.id } }),
    ).resolves.toMatchObject({
      title: "Mål Arkiv vinner",
      version: archiveWinner.goal.version,
    });

    const planningWinner =
      await createInactiveClientAndGoal("Planering vinner");
    const goalMutated = deferred();
    const allowGoalCommit = deferred();
    const editFirst = updateGoalForTest(
      {
        goalId: planningWinner.goal.id,
        expectedVersion: planningWinner.goal.version,
        title: "Sparat före arkivering",
        description: planningWinner.goal.description,
        startDate: "2026-08-13",
        targetDate: "2026-09-13",
      },
      fixture.administrator,
      {
        afterBusinessMutation: async () => {
          goalMutated.resolve();
          await allowGoalCommit.promise;
        },
      },
    );
    await goalMutated.promise;
    const archiveSecond = archiveClientForTest(
      {
        operationId: generateAuditOperationId(),
        clientId: planningWinner.client.id,
      },
      fixture.administrator,
      {},
    );
    allowGoalCommit.resolve();
    await expect(editFirst).resolves.toMatchObject({
      changed: true,
      goal: { title: "Sparat före arkivering", version: 2 },
    });
    await expect(archiveSecond).resolves.toMatchObject({
      clientId: planningWinner.client.id,
    });
    await expect(
      prisma.client.findUniqueOrThrow({
        where: { id: planningWinner.client.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: ClientStatus.ARCHIVED });
    await expect(
      prisma.goal.findUniqueOrThrow({ where: { id: planningWinner.goal.id } }),
    ).resolves.toMatchObject({ title: "Sparat före arkivering", version: 2 });
  });

  it("serializes reassignment before a stale terminal transition without false evidence", async () => {
    const fixture = await createFixture();
    const followUp = await createFollowUpForTest(
      followUpInput(fixture.firstClient.id, fixture.staff.userId),
      fixture.staff,
    );
    const reassignmentOperationId = generateAuditOperationId();
    const completionOperationId = generateAuditOperationId();
    const reassigned = deferred();
    const allowReassignmentCommit = deferred();
    const reassignment = reassignFollowUpForTest(
      {
        operationId: reassignmentOperationId,
        followUpId: followUp.id,
        expectedVersion: followUp.version,
        responsibleUserId: fixture.peer.userId,
      },
      fixture.staff,
      {
        afterBusinessMutation: async () => {
          reassigned.resolve();
          await allowReassignmentCommit.promise;
        },
      },
    );
    await reassigned.promise;
    const staleCompletion = completeFollowUpForTest(
      {
        operationId: completionOperationId,
        followUpId: followUp.id,
        expectedVersion: followUp.version,
      },
      fixture.staff,
    );
    allowReassignmentCommit.resolve();
    await expect(reassignment).resolves.toMatchObject({
      changed: true,
      followUp: {
        status: FollowUpStatus.PLANNED,
        version: 2,
        responsibleUser: { id: fixture.peer.userId },
      },
    });
    await expectPlanningCode(staleCompletion, "STALE_VERSION");
    await expect(
      prisma.followUpResponsibilityHistory.findMany({
        where: { followUpId: followUp.id },
        select: {
          auditOperationId: true,
          previousResponsibleUserId: true,
          newResponsibleUserId: true,
          followUpVersion: true,
        },
      }),
    ).resolves.toEqual([
      {
        auditOperationId: reassignmentOperationId,
        previousResponsibleUserId: fixture.staff.userId,
        newResponsibleUserId: fixture.peer.userId,
        followUpVersion: 2,
      },
    ]);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: {
          operationId_type: {
            operationId: reassignmentOperationId,
            type: "OUTCOME",
          },
        },
        select: { result: true },
      }),
    ).resolves.toEqual({ result: "SUCCEEDED" });
    expect(
      await prisma.auditOperation.count({
        where: { id: completionOperationId },
      }),
    ).toBe(0);
  });

  it("serializes ordinary Follow-up edits and reassignment in both lock orders", async () => {
    const fixture = await createFixture();
    const editFirstFollowUp = await createFollowUpForTest(
      followUpInput(
        fixture.firstClient.id,
        fixture.staff.userId,
        null,
        "Före redigering som vinner",
      ),
      fixture.staff,
    );
    const editMutated = deferred();
    const allowEditCommit = deferred();
    const editFirst = updateFollowUpForTest(
      {
        followUpId: editFirstFollowUp.id,
        expectedVersion: editFirstFollowUp.version,
        title: "Redigering vann",
        description: "Fiktiv sparad redigering.",
        dueDate: "2026-08-18",
        dueTime: "10:15",
        goalId: null,
      },
      fixture.staff,
      {
        afterBusinessMutation: async () => {
          editMutated.resolve();
          await allowEditCommit.promise;
        },
      },
    );
    await editMutated.promise;
    const losingReassignmentOperationId = generateAuditOperationId();
    const losingReassignment = reassignFollowUpForTest(
      {
        operationId: losingReassignmentOperationId,
        followUpId: editFirstFollowUp.id,
        expectedVersion: editFirstFollowUp.version,
        responsibleUserId: fixture.peer.userId,
      },
      fixture.staff,
    );
    await waitForClientMutationLockWaiter(fixture.firstClient.id);
    allowEditCommit.resolve();
    await expect(editFirst).resolves.toMatchObject({
      changed: true,
      followUp: {
        title: "Redigering vann",
        description: "Fiktiv sparad redigering.",
        dueTime: "10:15",
        version: 2,
        responsibleUser: { id: fixture.staff.userId },
      },
    });
    await expectPlanningCode(losingReassignment, "STALE_VERSION");
    await expect(
      prisma.followUp.findUniqueOrThrow({
        where: { id: editFirstFollowUp.id },
      }),
    ).resolves.toMatchObject({
      title: "Redigering vann",
      description: "Fiktiv sparad redigering.",
      responsibleUserId: fixture.staff.userId,
      version: 2,
    });
    expect(
      await prisma.followUpResponsibilityHistory.count({
        where: { followUpId: editFirstFollowUp.id },
      }),
    ).toBe(0);
    expect(
      await prisma.auditOperation.count({
        where: { id: losingReassignmentOperationId },
      }),
    ).toBe(0);

    const reassignmentFirstFollowUp = await createFollowUpForTest(
      followUpInput(
        fixture.firstClient.id,
        fixture.staff.userId,
        null,
        "Oförändrad när omtilldelning vinner",
      ),
      fixture.staff,
    );
    const reassignmentOperationId = generateAuditOperationId();
    const reassigned = deferred();
    const allowReassignmentCommit = deferred();
    const reassignmentFirst = reassignFollowUpForTest(
      {
        operationId: reassignmentOperationId,
        followUpId: reassignmentFirstFollowUp.id,
        expectedVersion: reassignmentFirstFollowUp.version,
        responsibleUserId: fixture.peer.userId,
      },
      fixture.staff,
      {
        afterBusinessMutation: async () => {
          reassigned.resolve();
          await allowReassignmentCommit.promise;
        },
      },
    );
    await reassigned.promise;
    const losingEdit = updateFollowUpForTest(
      {
        followUpId: reassignmentFirstFollowUp.id,
        expectedVersion: reassignmentFirstFollowUp.version,
        title: "Ska inte skriva över omtilldelning",
        description: null,
        dueDate: "2026-08-19",
        dueTime: null,
        goalId: null,
      },
      fixture.staff,
    );
    await waitForClientMutationLockWaiter(fixture.firstClient.id);
    allowReassignmentCommit.resolve();
    await expect(reassignmentFirst).resolves.toMatchObject({
      changed: true,
      followUp: {
        title: "Oförändrad när omtilldelning vinner",
        responsibleUser: { id: fixture.peer.userId },
        version: 2,
      },
    });
    await expectPlanningCode(losingEdit, "STALE_VERSION");
    await expect(
      prisma.followUp.findUniqueOrThrow({
        where: { id: reassignmentFirstFollowUp.id },
      }),
    ).resolves.toMatchObject({
      title: "Oförändrad när omtilldelning vinner",
      responsibleUserId: fixture.peer.userId,
      version: 2,
    });
    await expect(
      prisma.followUpResponsibilityHistory.findMany({
        where: { followUpId: reassignmentFirstFollowUp.id },
        select: {
          auditOperationId: true,
          previousResponsibleUserId: true,
          newResponsibleUserId: true,
          followUpVersion: true,
        },
      }),
    ).resolves.toEqual([
      {
        auditOperationId: reassignmentOperationId,
        previousResponsibleUserId: fixture.staff.userId,
        newResponsibleUserId: fixture.peer.userId,
        followUpVersion: 2,
      },
    ]);
    await expect(
      prisma.auditEvent.findMany({
        where: {
          operationId: reassignmentOperationId,
          type: "OUTCOME",
        },
        select: { result: true },
      }),
    ).resolves.toEqual([{ result: "SUCCEEDED" }]);
  });

  it("keeps a terminal Follow-up when completion wins before reassignment", async () => {
    const fixture = await createFixture();
    const followUp = await createFollowUpForTest(
      followUpInput(fixture.firstClient.id, fixture.staff.userId),
      fixture.staff,
    );
    const completionOperationId = generateAuditOperationId();
    const reassignmentOperationId = generateAuditOperationId();
    const completed = deferred();
    const allowCompletionCommit = deferred();
    const completion = completeFollowUpForTest(
      {
        operationId: completionOperationId,
        followUpId: followUp.id,
        expectedVersion: followUp.version,
      },
      fixture.staff,
      {
        afterBusinessMutation: async () => {
          completed.resolve();
          await allowCompletionCommit.promise;
        },
      },
    );
    await completed.promise;
    const losingReassignment = reassignFollowUpForTest(
      {
        operationId: reassignmentOperationId,
        followUpId: followUp.id,
        expectedVersion: followUp.version,
        responsibleUserId: fixture.peer.userId,
      },
      fixture.staff,
    );
    await waitForClientMutationLockWaiter(fixture.firstClient.id);
    allowCompletionCommit.resolve();
    await expect(completion).resolves.toMatchObject({
      status: FollowUpStatus.COMPLETED,
      version: 2,
      responsibleUser: { id: fixture.staff.userId },
      completedByUser: { id: fixture.staff.userId },
    });
    await expectPlanningCode(losingReassignment, "INVALID_STATE");
    await expect(
      prisma.followUp.findUniqueOrThrow({ where: { id: followUp.id } }),
    ).resolves.toMatchObject({
      status: FollowUpStatus.COMPLETED,
      responsibleUserId: fixture.staff.userId,
      version: 2,
    });
    expect(
      await prisma.followUpResponsibilityHistory.count({
        where: { followUpId: followUp.id },
      }),
    ).toBe(0);
    expect(
      await prisma.auditOperation.count({
        where: { id: reassignmentOperationId },
      }),
    ).toBe(0);
    await expect(
      prisma.auditEvent.findMany({
        where: {
          operation: {
            targetId: followUp.id,
            action: "FOLLOW_UP_COMPLETED",
          },
          type: "OUTCOME",
        },
        select: { operationId: true, result: true },
      }),
    ).resolves.toEqual([
      { operationId: completionOperationId, result: "SUCCEEDED" },
    ]);
  });

  it("derives and orders only the current user's authorised Home window", async () => {
    const fixture = await createFixture();
    const dueItems = [
      ["Försenad nära", "2026-08-12", null],
      ["Försenad äldre", "2026-08-10", null],
      ["Idag datum", "2026-08-13", null],
      ["Idag försenad tid", "2026-08-13", "11:00"],
      ["Kommande", "2026-08-14", null],
      ["Sjunde dagen", "2026-08-20", null],
      ["Utanför", "2026-08-21", null],
    ] as const;
    for (const [title, dueDate, dueTime] of dueItems) {
      await createFollowUpForTest(
        {
          ...followUpInput(
            fixture.firstClient.id,
            fixture.staff.userId,
            null,
            title,
          ),
          dueDate,
          dueTime,
        },
        fixture.staff,
      );
    }
    await createFollowUpForTest(
      followUpInput(
        fixture.firstClient.id,
        fixture.peer.userId,
        null,
        "Annan ansvarig",
      ),
      fixture.staff,
    );
    const items = await listOwnFollowUpsForHomeForTest(
      fixture.staff,
      new Date("2026-08-13T10:00:00.000Z"),
    );
    expect(items.map(({ title }) => title)).toEqual([
      "Idag försenad tid",
      "Försenad nära",
      "Försenad äldre",
      "Idag datum",
      "Kommande",
      "Sjunde dagen",
    ]);
    expect(items.map(({ dueState }) => dueState)).toEqual([
      "OVERDUE",
      "OVERDUE",
      "OVERDUE",
      "DUE_TODAY",
      "UPCOMING",
      "UPCOMING",
    ]);
  });

  it("keeps Journal Goal choices private and freezes immutable signing snapshots", async () => {
    const fixture = await createFixture();
    const firstGoal = await createGoalForTest(
      goalInput(fixture.firstClient.id, "Mål före signering"),
      fixture.staff,
    );
    const secondGoal = await createGoalForTest(
      goalInput(fixture.firstClient.id, "Andra målet"),
      fixture.staff,
    );
    const crossClientGoal = await createGoalForTest(
      goalInput(fixture.secondClient.id, "Fel klient"),
      fixture.staff,
    );
    expect(
      await listAvailableJournalGoalsForTest(
        { clientId: fixture.firstClient.id },
        fixture.staff,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstGoal.id }),
        expect.objectContaining({ id: secondGoal.id }),
      ]),
    );

    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "CONVERSATION",
        eventOccurredAt: new Date("2026-08-13T08:00:00.000Z"),
        content: "Fiktiv anteckning med mål.",
      },
      fixture.staff,
    );
    await expect(
      replaceJournalDraftGoalsForTest(
        {
          journalEntryId: draft.id,
          expectedVersion: draft.version,
          goalIds: [crossClientGoal.id],
        },
        fixture.staff,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      replaceJournalDraftGoalsForTest(
        {
          journalEntryId: draft.id,
          expectedVersion: draft.version,
          goalIds: [firstGoal.id],
        },
        fixture.peer,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });

    const selected = await replaceJournalDraftGoalsForTest(
      {
        journalEntryId: draft.id,
        expectedVersion: draft.version,
        goalIds: [firstGoal.id, secondGoal.id],
      },
      fixture.staff,
    );
    const renamed = await updateGoalForTest(
      {
        goalId: firstGoal.id,
        expectedVersion: firstGoal.version,
        title: "Mål vid signering",
        description: firstGoal.description,
        startDate: "2026-08-13",
        targetDate: "2026-09-13",
      },
      fixture.staff,
    );
    expect(renamed.changed).toBe(true);
    const signed = await signJournalDraftForTest(
      {
        operationId: generateAuditOperationId(),
        journalEntryId: draft.id,
        expectedVersion: selected.draft.version,
      },
      fixture.staff,
    );
    expect(signed.goalReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goalId: firstGoal.id,
          titleSnapshot: "Mål vid signering",
        }),
        expect.objectContaining({
          goalId: secondGoal.id,
          titleSnapshot: "Andra målet",
        }),
      ]),
    );
    const detail = await getSignedJournalEntryForTest(
      { journalEntryId: signed.id },
      fixture.staff,
    );
    expect(detail.goalReferences[0]?.titleSnapshot).not.toBeNull();

    await updateGoalForTest(
      {
        goalId: secondGoal.id,
        expectedVersion: secondGoal.version,
        title: "Ändrat efter signering",
        description: secondGoal.description,
        startDate: "2026-08-13",
        targetDate: "2026-09-13",
      },
      fixture.staff,
    );
    const unchangedSignedDetail = await getSignedJournalEntryForTest(
      { journalEntryId: signed.id },
      fixture.staff,
    );
    expect(
      unchangedSignedDetail.goalReferences.find(
        ({ goalId }) => goalId === secondGoal.id,
      )?.titleSnapshot,
    ).toBe("Andra målet");
    await completeGoalForTest(
      {
        operationId: generateAuditOperationId(),
        goalId: firstGoal.id,
        expectedVersion: renamed.goal.version,
      },
      fixture.staff,
    );
    expect(
      (
        await getSignedJournalEntryForTest(
          { journalEntryId: signed.id },
          fixture.staff,
        )
      ).goalReferences.find(({ goalId }) => goalId === firstGoal.id)
        ?.titleSnapshot,
    ).toBe("Mål vid signering");

    await expect(
      prisma.journalGoalReference.delete({
        where: {
          journalEntryId_goalId: {
            journalEntryId: signed.id,
            goalId: firstGoal.id,
          },
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.journalGoalReference.update({
        where: {
          journalEntryId_goalId: {
            journalEntryId: signed.id,
            goalId: firstGoal.id,
          },
        },
        data: { titleSnapshot: "Manipulerad titel" },
      }),
    ).rejects.toThrow();
    const retrospectiveGoal = await createGoalForTest(
      goalInput(fixture.firstClient.id, "Retrospektivt mål"),
      fixture.staff,
    );
    await expect(
      prisma.journalGoalReference.create({
        data: {
          organisationId: fixture.organisationId,
          clientId: fixture.firstClient.id,
          journalEntryId: signed.id,
          goalId: retrospectiveGoal.id,
        },
      }),
    ).rejects.toThrow();

    const { draft: zeroGoalDraft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OTHER",
        eventOccurredAt: new Date("2026-08-13T09:00:00.000Z"),
        content: "Fiktiv anteckning utan mål.",
      },
      fixture.staff,
    );
    const zeroGoalSigned = await signJournalDraftForTest(
      {
        operationId: generateAuditOperationId(),
        journalEntryId: zeroGoalDraft.id,
        expectedVersion: zeroGoalDraft.version,
      },
      fixture.staff,
    );
    expect(zeroGoalSigned.goalReferences).toEqual([]);
  });

  it("serializes Journal signing before a losing Goal-selection mutation", async () => {
    const fixture = await createFixture();
    const [selectedGoal, losingGoal] = await Promise.all([
      createGoalForTest(
        goalInput(fixture.firstClient.id, "Valt mål vid signering"),
        fixture.staff,
      ),
      createGoalForTest(
        goalInput(fixture.firstClient.id, "Förlorande målval"),
        fixture.staff,
      ),
    ]);
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OBSERVATION",
        eventOccurredAt: new Date("2026-08-13T10:00:00.000Z"),
        content: "Fiktiv anteckning för samtidig målselektion.",
      },
      fixture.staff,
    );
    const selected = await replaceJournalDraftGoalsForTest(
      {
        journalEntryId: draft.id,
        expectedVersion: draft.version,
        goalIds: [selectedGoal.id],
      },
      fixture.staff,
    );
    const signingMutated = deferred();
    const allowSigningCommit = deferred();
    const signing = signJournalDraftForTest(
      {
        operationId: generateAuditOperationId(),
        journalEntryId: draft.id,
        expectedVersion: selected.draft.version,
      },
      fixture.staff,
      {
        afterSigningMutation: async () => {
          signingMutated.resolve();
          await allowSigningCommit.promise;
        },
      },
    );
    await signingMutated.promise;
    const losingSelection = replaceJournalDraftGoalsForTest(
      {
        journalEntryId: draft.id,
        expectedVersion: selected.draft.version,
        goalIds: [losingGoal.id],
      },
      fixture.staff,
    );
    allowSigningCommit.resolve();
    await expect(signing).resolves.toMatchObject({
      status: "SIGNED",
      goalReferences: [
        expect.objectContaining({
          goalId: selectedGoal.id,
          titleSnapshot: "Valt mål vid signering",
        }),
      ],
    });
    await expect(losingSelection).rejects.toMatchObject({
      code: "TARGET_UNAVAILABLE",
    });
    await expect(
      getSignedJournalEntryForTest({ journalEntryId: draft.id }, fixture.staff),
    ).resolves.toMatchObject({
      goalReferences: [
        expect.objectContaining({
          goalId: selectedGoal.id,
          titleSnapshot: "Valt mål vid signering",
        }),
      ],
    });
  });

  it("signs the committed Goal selection when selection wins the Client lock", async () => {
    const fixture = await createFixture();
    const [firstGoal, secondGoal] = await Promise.all([
      createGoalForTest(
        goalInput(fixture.firstClient.id, "Första vinnande målvalet"),
        fixture.staff,
      ),
      createGoalForTest(
        goalInput(fixture.firstClient.id, "Andra vinnande målvalet"),
        fixture.staff,
      ),
    ]);
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OBSERVATION",
        eventOccurredAt: new Date("2026-08-13T10:30:00.000Z"),
        content: "Fiktiv anteckning där målvalet vinner låset.",
      },
      fixture.staff,
    );
    const selectionMutated = deferred();
    const allowSelectionCommit = deferred();
    const selection = replaceJournalDraftGoalsForTest(
      {
        journalEntryId: draft.id,
        expectedVersion: draft.version,
        goalIds: [firstGoal.id, secondGoal.id],
      },
      fixture.staff,
      {
        afterDraftGoalMutation: async () => {
          selectionMutated.resolve();
          await allowSelectionCommit.promise;
        },
      },
    );
    await selectionMutated.promise;
    const signing = signJournalDraftForTest(
      {
        operationId: generateAuditOperationId(),
        journalEntryId: draft.id,
        expectedVersion: draft.version + 1,
      },
      fixture.staff,
    );
    await waitForClientMutationLockWaiter(fixture.firstClient.id);
    allowSelectionCommit.resolve();
    await expect(selection).resolves.toMatchObject({
      changed: true,
      draft: { status: "DRAFT", version: draft.version + 1 },
    });
    const signed = await signing;
    expect(signed).toMatchObject({
      status: "SIGNED",
      version: draft.version + 2,
    });
    expect(signed.goalReferences).toHaveLength(2);
    expect(signed.goalReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goalId: firstGoal.id,
          titleSnapshot: "Första vinnande målvalet",
        }),
        expect.objectContaining({
          goalId: secondGoal.id,
          titleSnapshot: "Andra vinnande målvalet",
        }),
      ]),
    );
    await expect(
      replaceJournalDraftGoalsForTest(
        {
          journalEntryId: draft.id,
          expectedVersion: signed.version,
          goalIds: [firstGoal.id],
        },
        fixture.staff,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      getSignedJournalEntryForTest({ journalEntryId: draft.id }, fixture.staff),
    ).resolves.toMatchObject({
      goalReferences: expect.arrayContaining([
        expect.objectContaining({
          goalId: firstGoal.id,
          titleSnapshot: "Första vinnande målvalet",
        }),
        expect.objectContaining({
          goalId: secondGoal.id,
          titleSnapshot: "Andra vinnande målvalet",
        }),
      ]),
    });
  });

  it("serializes Goal title changes and Journal signing coherently in both lock orders", async () => {
    const fixture = await createFixture();
    const goal = await createGoalForTest(
      goalInput(fixture.firstClient.id, "Titel före kapplöpning"),
      fixture.staff,
    );
    const { draft: renameFirstDraft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "CONVERSATION",
        eventOccurredAt: new Date("2026-08-13T11:00:00.000Z"),
        content: "Fiktiv anteckning när målnamnet ändras först.",
      },
      fixture.staff,
    );
    const renameFirstSelection = await replaceJournalDraftGoalsForTest(
      {
        journalEntryId: renameFirstDraft.id,
        expectedVersion: renameFirstDraft.version,
        goalIds: [goal.id],
      },
      fixture.staff,
    );
    const goalRenamed = deferred();
    const allowRenameCommit = deferred();
    const renameFirst = updateGoalForTest(
      {
        goalId: goal.id,
        expectedVersion: goal.version,
        title: "Titel sparad före signering",
        description: goal.description,
        startDate: "2026-08-13",
        targetDate: "2026-09-13",
      },
      fixture.staff,
      {
        afterBusinessMutation: async () => {
          goalRenamed.resolve();
          await allowRenameCommit.promise;
        },
      },
    );
    await goalRenamed.promise;
    const signAfterRename = signJournalDraftForTest(
      {
        operationId: generateAuditOperationId(),
        journalEntryId: renameFirstDraft.id,
        expectedVersion: renameFirstSelection.draft.version,
      },
      fixture.staff,
    );
    allowRenameCommit.resolve();
    const renamed = await renameFirst;
    await expect(signAfterRename).resolves.toMatchObject({
      goalReferences: [
        expect.objectContaining({
          titleSnapshot: "Titel sparad före signering",
        }),
      ],
    });

    const { draft: signingFirstDraft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OTHER",
        eventOccurredAt: new Date("2026-08-13T12:00:00.000Z"),
        content: "Fiktiv anteckning när signering sker först.",
      },
      fixture.staff,
    );
    const signingFirstSelection = await replaceJournalDraftGoalsForTest(
      {
        journalEntryId: signingFirstDraft.id,
        expectedVersion: signingFirstDraft.version,
        goalIds: [goal.id],
      },
      fixture.staff,
    );
    const signingMutated = deferred();
    const allowSigningCommit = deferred();
    const signFirst = signJournalDraftForTest(
      {
        operationId: generateAuditOperationId(),
        journalEntryId: signingFirstDraft.id,
        expectedVersion: signingFirstSelection.draft.version,
      },
      fixture.staff,
      {
        afterSigningMutation: async () => {
          signingMutated.resolve();
          await allowSigningCommit.promise;
        },
      },
    );
    await signingMutated.promise;
    const renameAfterSigning = updateGoalForTest(
      {
        goalId: goal.id,
        expectedVersion: renamed.goal.version,
        title: "Titel sparad efter signering",
        description: renamed.goal.description,
        startDate: "2026-08-13",
        targetDate: "2026-09-13",
      },
      fixture.staff,
    );
    allowSigningCommit.resolve();
    await expect(signFirst).resolves.toMatchObject({
      goalReferences: [
        expect.objectContaining({
          titleSnapshot: "Titel sparad före signering",
        }),
      ],
    });
    await expect(renameAfterSigning).resolves.toMatchObject({
      changed: true,
      goal: { title: "Titel sparad efter signering" },
    });
    await expect(
      getSignedJournalEntryForTest(
        { journalEntryId: signingFirstDraft.id },
        fixture.staff,
      ),
    ).resolves.toMatchObject({
      goalReferences: [
        expect.objectContaining({
          titleSnapshot: "Titel sparad före signering",
        }),
      ],
    });
  });

  it("rejects ambiguous and nonexistent Follow-up wall times", async () => {
    const fixture = await createFixture();
    await expect(
      createFollowUpForTest(
        {
          ...followUpInput(fixture.firstClient.id, fixture.staff.userId),
          dueDate: "2026-03-29",
          dueTime: "02:30",
        },
        fixture.staff,
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      createFollowUpForTest(
        {
          ...followUpInput(fixture.firstClient.id, fixture.staff.userId),
          dueDate: "2026-10-25",
          dueTime: "02:30",
        },
        fixture.staff,
      ),
    ).rejects.toMatchObject({ name: "ZodError" });

    const insertRawTimedFollowUp = (
      dueDate: string,
      dueTime: string,
      dueAt: string,
    ) =>
      prisma.$executeRaw`
        INSERT INTO "followUp" (
          "id", "organisationId", "clientId", "title", "dueDate", "dueTime",
          "dueAt", "createdByUserId", "responsibleUserId", "updatedAt"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${fixture.organisationId},
          ${fixture.firstClient.id}::uuid,
          ${`Fiktiv rå DST ${dueDate} ${dueTime}`},
          ${dueDate}::date,
          ${dueTime},
          ${dueAt}::timestamptz,
          ${fixture.staff.userId},
          ${fixture.staff.userId},
          CURRENT_TIMESTAMP
        )
      `;

    await expect(
      insertRawTimedFollowUp("2026-03-29", "02:30", "2026-03-29T01:30:00.000Z"),
    ).rejects.toThrow();
    await expect(
      insertRawTimedFollowUp("2026-10-25", "02:30", "2026-10-25T01:30:00.000Z"),
    ).rejects.toThrow();
    await expect(
      insertRawTimedFollowUp("2026-10-25", "02:30", "2026-10-25T00:30:00.000Z"),
    ).rejects.toThrow();
    await expect(
      insertRawTimedFollowUp("2026-01-15", "10:30", "2026-01-15T09:30:00.000Z"),
    ).resolves.toBe(1);
    await expect(
      insertRawTimedFollowUp("2026-07-15", "10:30", "2026-07-15T08:30:00.000Z"),
    ).resolves.toBe(1);
  });

  it("installs the reviewed M4 scope, retention, audit-binding, and DST database mechanisms", async () => {
    const constraints = await prisma.$queryRaw<
      Array<{ name: string; type: string; deleteAction: string }>
    >`
      SELECT conname AS "name", contype::text AS "type", confdeltype::text AS "deleteAction"
        FROM pg_constraint
       WHERE conrelid IN (
         '"goal"'::regclass,
         '"followUp"'::regclass,
         '"followUpResponsibilityHistory"'::regclass,
         '"journalGoalReference"'::regclass,
         '"journalEntry"'::regclass
       )
    `;
    const triggers = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT tgname AS "name"
        FROM pg_trigger
       WHERE tgrelid IN (
         '"goal"'::regclass,
         '"followUp"'::regclass,
         '"followUpResponsibilityHistory"'::regclass,
         '"journalGoalReference"'::regclass,
         '"journalEntry"'::regclass
       )
         AND NOT tgisinternal
    `;
    const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS "name"
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN (
           'goal',
           'followUp',
           'followUpResponsibilityHistory',
           'journalGoalReference'
         )
    `;
    const functions = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT proname AS "name"
        FROM pg_proc
       WHERE proname = 'isValidUniqueStockholmDueTime'
    `;

    expect(constraints.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "goal_scope_client_fkey",
        "followUp_scope_client_fkey",
        "followUp_scope_goal_fkey",
        "history_scope_followUp_fkey",
        "history_audit_operation_fkey",
        "journalGoalReference_scope_entry_fkey",
        "journalGoalReference_scope_goal_fkey",
        "followUp_due_time_check",
      ]),
    );
    expect(
      constraints
        .filter(({ type }) => type === "f")
        .every(({ deleteAction }) => deleteAction === "r"),
    ).toBe(true);
    expect(triggers.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "goal_protect_lifecycle",
        "goal_prevent_truncate",
        "followUp_protect_lifecycle",
        "followUp_create_responsibility_history",
        "followUp_prevent_truncate",
        "followUp_require_transition_audit",
        "history_protect_mutation",
        "history_prevent_truncate",
        "journalGoalReference_protect_mutation",
        "journalGoalReference_prevent_truncate",
        "journalEntry_freeze_goal_references",
      ]),
    );
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "history_audit_operation_key",
        "followUpResponsibilityHistory_followUp_version_key",
        "followUp_organisationId_responsible_status_due_idx",
        "journalGoalReference_scope_goal_idx",
      ]),
    );
    expect(functions).toEqual([{ name: "isValidUniqueStockholmDueTime" }]);
  });
});
