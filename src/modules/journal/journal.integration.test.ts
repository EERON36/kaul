import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  AssignmentResponsibility,
  ClientStatus,
  JournalEntryStatus,
  UserRole,
  type Prisma,
} from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  appendAuditOutcomeInTransaction,
  createUserAuditIntent,
  generateAuditOperationId,
  recordFailedAuditOutcome,
} from "../audit/audit";
import type { ApplicationUser } from "../authentication/guards";
import { lockClientForMutation } from "../clients/client-mutation-lock";
import {
  beginJournalCorrectionForTest,
  createJournalDraftForTest,
  discardJournalDraftForTest,
  getCurrentJournalDraftForTest,
  getSignedJournalEntryForTest,
  listSignedJournalEntriesForTest,
  saveJournalDraftForTest,
  signJournalDraftForTest,
  verifySigningTransactionCompletionForTest,
} from "./journal.test-support";

const eventOne = new Date("2026-08-10T08:15:00.000Z");
const eventTwo = new Date("2026-08-11T13:45:00.000Z");
const JOURNAL_FIXTURE_ORGANISATION_PREFIX = "Fiktiv journalorganisation ";
const organisationIds = new Set<string>();

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
  throw new Error("Timed out waiting for the recovery lock waiter.");
}

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
      email: `${id}@example.test`,
      role,
      organisationId,
      professionalTitle: `Fiktiv titel för ${label}`,
      mustChangePassword: false,
      banned: false,
    },
  });
}

async function createFixture() {
  const organisationId = randomUUID();
  const organisationName = `${JOURNAL_FIXTURE_ORGANISATION_PREFIX}${organisationId}`;
  organisationIds.add(organisationId);
  await prisma.organisation.create({
    data: { id: organisationId, name: organisationName },
  });

  const [administratorUser, authorUser, peerUser, unassignedUser] =
    await Promise.all([
      createUser(organisationId, UserRole.ADMINISTRATOR, "administratör"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "författare"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "kollega"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "utan uppdrag"),
    ]);
  const [firstClient, secondClient] = await Promise.all(
    ["JOURNAL-A", "JOURNAL-B"].map((personIdentifier) =>
      prisma.client.create({
        data: {
          id: randomUUID(),
          organisationId,
          firstName: "Fiktiv",
          lastName: `Klient ${personIdentifier}`,
          personIdentifier: `${personIdentifier}-${randomUUID()}`,
          category: "ADULT",
          status: ClientStatus.ACTIVE,
        },
      }),
    ),
  );

  for (const client of [firstClient, secondClient]) {
    await prisma.assignment.createMany({
      data: [
        {
          id: randomUUID(),
          organisationId,
          clientId: client.id,
          staffUserId: peerUser.id,
          responsibility: AssignmentResponsibility.PRIMARY,
          createdByUserId: administratorUser.id,
        },
        {
          id: randomUUID(),
          organisationId,
          clientId: client.id,
          staffUserId: authorUser.id,
          responsibility: AssignmentResponsibility.SECONDARY,
          createdByUserId: administratorUser.id,
        },
      ],
    });
  }

  return {
    organisationId,
    organisationName,
    administrator: applicationUser(administratorUser, organisationName),
    author: applicationUser(authorUser, organisationName),
    peer: applicationUser(peerUser, organisationName),
    unassigned: applicationUser(unassignedUser, organisationName),
    firstClient,
    secondClient,
  };
}

async function cleanupFixtureOrganisations(ids: readonly string[]) {
  if (ids.length === 0) return;

  await prisma.$transaction(async (transaction) => {
    // Test teardown is the only place that temporarily disables the Journal's
    // user triggers. It removes this suite's fictional fixtures after the
    // lower-level immutability assertions have completed.
    await transaction.$executeRawUnsafe(
      'ALTER TABLE "journalEntry" DISABLE TRIGGER USER',
    );
    try {
      await transaction.journalEntry.deleteMany({
        where: { organisationId: { in: [...ids] } },
      });
    } finally {
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "journalEntry" ENABLE TRIGGER USER',
      );
    }
    await transaction.assignment.deleteMany({
      where: { organisationId: { in: [...ids] } },
    });
    await transaction.client.deleteMany({
      where: { organisationId: { in: [...ids] } },
    });
    await transaction.session.deleteMany({
      where: { user: { organisationId: { in: [...ids] } } },
    });
    await transaction.account.deleteMany({
      where: { user: { organisationId: { in: [...ids] } } },
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
  const staleFixtures = await prisma.organisation.findMany({
    where: { name: { startsWith: JOURNAL_FIXTURE_ORGANISATION_PREFIX } },
    select: { id: true },
  });
  await cleanupFixtureOrganisations(staleFixtures.map(({ id }) => id));
});

afterEach(async () => {
  const ids = [...organisationIds];
  organisationIds.clear();
  await cleanupFixtureOrganisations(ids);
});

async function createAndSignOriginal(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  actor: ApplicationUser = fixture.author,
  clientId: string = fixture.firstClient.id,
) {
  const { draft } = await createJournalDraftForTest(
    {
      clientId,
      entryType: "CONVERSATION",
      eventOccurredAt: eventOne,
      content: "Fiktiv signerad originalanteckning.",
    },
    actor,
  );
  return signJournalDraftForTest(
    {
      operationId: generateAuditOperationId(),
      journalEntryId: draft.id,
      expectedVersion: draft.version,
    },
    actor,
  );
}

async function expectRawSigningRejectedWithAuditEvidence(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  journalEntryId: string,
  action: "JOURNAL_ENTRY_SIGNED" | "JOURNAL_CORRECTION_SIGNED",
  attempt: (transaction: Prisma.TransactionClient) => Promise<unknown>,
) {
  const operationId = generateAuditOperationId();
  const intent = await createUserAuditIntent({
    operationId,
    actor: fixture.author,
    action,
    target: { targetId: journalEntryId },
  });

  await expect(
    prisma.$transaction(async (transaction) => {
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        journalEntryId,
      );
      await attempt(transaction);
    }),
  ).rejects.toThrow();

  await recordFailedAuditOutcome(intent);
  await expect(
    prisma.auditEvent.findUniqueOrThrow({
      where: { operationId_type: { operationId, type: "OUTCOME" } },
    }),
  ).resolves.toMatchObject({ result: "FAILED" });
}

describe("Journal foundation with PostgreSQL", () => {
  it("keeps drafts author-private and removes access when the author loses Client access", async () => {
    const fixture = await createFixture();
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "DAILY_NOTE",
        eventOccurredAt: eventOne,
        content: "Fiktivt privat utkast.",
      },
      fixture.author,
    );

    await expect(
      getCurrentJournalDraftForTest(
        { clientId: fixture.firstClient.id },
        fixture.author,
      ),
    ).resolves.toMatchObject({ id: draft.id });
    await expect(
      getCurrentJournalDraftForTest(
        { clientId: fixture.firstClient.id },
        fixture.peer,
      ),
    ).resolves.toBeNull();
    await expect(
      getCurrentJournalDraftForTest(
        { clientId: fixture.firstClient.id },
        fixture.administrator,
      ),
    ).resolves.toBeNull();

    for (const actor of [fixture.peer, fixture.administrator]) {
      await expect(
        saveJournalDraftForTest(
          {
            journalEntryId: draft.id,
            expectedVersion: draft.version,
            entryType: "OTHER",
            eventOccurredAt: eventTwo,
            content: "Får inte sparas.",
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    }

    await prisma.assignment.updateMany({
      where: {
        organisationId: fixture.organisationId,
        clientId: fixture.firstClient.id,
        staffUserId: fixture.author.userId,
        endedAt: null,
      },
      data: { endedAt: new Date() },
    });

    await expect(
      getCurrentJournalDraftForTest(
        { clientId: fixture.firstClient.id },
        fixture.author,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      saveJournalDraftForTest(
        {
          journalEntryId: draft.id,
          expectedVersion: draft.version,
          entryType: "DAILY_NOTE",
          eventOccurredAt: eventOne,
          content: "Förlorad åtkomst får inte kringgås av författarskap.",
        },
        fixture.author,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
  });

  it("enforces one open draft per author and Client under concurrency without limiting other valid scopes", async () => {
    const fixture = await createFixture();
    const attempts = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        createJournalDraftForTest(
          {
            clientId: fixture.firstClient.id,
            entryType: index === 0 ? "MEETING" : "PHONE_CALL",
            eventOccurredAt: eventOne,
            content: `Fiktivt samtidigt utkast ${index + 1}.`,
          },
          fixture.author,
        ),
      ),
    );

    expect(new Set(attempts.map(({ draft }) => draft.id)).size).toBe(1);
    await expect(
      prisma.journalEntry.count({
        where: {
          organisationId: fixture.organisationId,
          clientId: fixture.firstClient.id,
          authorUserId: fixture.author.userId,
          status: JournalEntryStatus.DRAFT,
        },
      }),
    ).resolves.toBe(1);

    const peerDraft = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OBSERVATION",
        eventOccurredAt: eventOne,
        content: "Fiktivt kollegautkast.",
      },
      fixture.peer,
    );
    const otherClientDraft = await createJournalDraftForTest(
      {
        clientId: fixture.secondClient.id,
        entryType: "SCHOOL_CONTACT",
        eventOccurredAt: eventTwo,
        content: "Fiktivt utkast för annan klient.",
      },
      fixture.author,
    );
    expect(peerDraft.draft.id).not.toBe(attempts[0]!.draft.id);
    expect(otherClientDraft.draft.id).not.toBe(attempts[0]!.draft.id);
  });

  it("preserves event time separately, rejects stale writes and creates no draft-save audit noise", async () => {
    const fixture = await createFixture();
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "HOME_VISIT",
        eventOccurredAt: eventOne,
        content: "Fiktiv första version.",
      },
      fixture.author,
    );
    const saved = await saveJournalDraftForTest(
      {
        journalEntryId: draft.id,
        expectedVersion: 1,
        entryType: "PHONE_CALL",
        eventOccurredAt: eventTwo,
        content: "  Fiktiv andra version.\n\nBevarat stycke.  ",
      },
      fixture.author,
    );

    expect(saved).toMatchObject({
      status: JournalEntryStatus.DRAFT,
      version: 2,
      eventOccurredAt: eventTwo,
      content: "  Fiktiv andra version.\n\nBevarat stycke.  ",
      signedAt: null,
    });
    expect(saved.eventOccurredAt.getTime()).not.toBe(saved.createdAt.getTime());
    expect(saved.signedAt).toBeNull();
    await expect(
      prisma.auditOperation.count({ where: { targetId: draft.id } }),
    ).resolves.toBe(0);

    await expect(
      saveJournalDraftForTest(
        {
          journalEntryId: draft.id,
          expectedVersion: 1,
          entryType: "OTHER",
          eventOccurredAt: eventOne,
          content: "Fiktiv stale version som inte får skriva över.",
        },
        fixture.author,
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(
      discardJournalDraftForTest(
        { journalEntryId: draft.id, expectedVersion: 1 },
        fixture.author,
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(
      prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({
      version: 2,
      content: "  Fiktiv andra version.\n\nBevarat stycke.  ",
    });

    await discardJournalDraftForTest(
      { journalEntryId: draft.id, expectedVersion: 2 },
      fixture.author,
    );
    await expect(
      prisma.auditOperation.count({ where: { targetId: draft.id } }),
    ).resolves.toBe(0);
  });

  it("signs exactly once under concurrency with server-owned metadata and truthful audit outcomes", async () => {
    const fixture = await createFixture();
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "CONVERSATION",
        eventOccurredAt: eventOne,
        content: "Fiktiv anteckning för samtidig signering.",
      },
      fixture.author,
    );
    const staleOperationId = generateAuditOperationId();
    const saved = await saveJournalDraftForTest(
      {
        journalEntryId: draft.id,
        expectedVersion: draft.version,
        entryType: "CONVERSATION",
        eventOccurredAt: eventOne,
        content: "Fiktiv aktuell version för samtidig signering.",
      },
      fixture.author,
    );
    await expect(
      signJournalDraftForTest(
        {
          operationId: staleOperationId,
          journalEntryId: draft.id,
          expectedVersion: draft.version,
        },
        fixture.author,
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(
      prisma.auditOperation.findUnique({ where: { id: staleOperationId } }),
    ).resolves.toBeNull();

    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const beforeSigningTransaction = async () => {
      arrivals += 1;
      if (arrivals === 2) release();
      await gate;
    };
    const operationIds = [
      generateAuditOperationId(),
      generateAuditOperationId(),
    ];
    const spoofedActor = {
      ...fixture.author,
      name: "Browser-supplied name must not win",
      professionalTitle: "Browser-supplied title must not win",
      role: UserRole.ADMINISTRATOR,
    } satisfies ApplicationUser;
    const results = await Promise.allSettled(
      operationIds.map((operationId) =>
        signJournalDraftForTest(
          {
            operationId,
            journalEntryId: draft.id,
            expectedVersion: saved.version,
          },
          spoofedActor,
          { beforeSigningTransaction },
        ),
      ),
    );

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: "SIGNING_CONFLICT" }),
      }),
    ]);
    const signed = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(signed).toMatchObject({
      status: JournalEntryStatus.SIGNED,
      version: saved.version + 1,
      signerUserId: fixture.author.userId,
      signerName: fixture.author.name,
      signerProfessionalTitle: fixture.author.professionalTitle,
      signerRole: UserRole.STAFF_MEMBER,
    });
    expect(signed.signedAt).not.toBeNull();
    const outcomes = await prisma.auditEvent.findMany({
      where: { operationId: { in: operationIds }, type: "OUTCOME" },
      select: { result: true },
    });
    expect(
      outcomes.filter(({ result }) => result === "SUCCEEDED"),
    ).toHaveLength(1);
    expect(outcomes.filter(({ result }) => result === "FAILED")).toHaveLength(
      1,
    );
    const successfulOperation = await prisma.auditOperation.findFirstOrThrow({
      where: {
        id: { in: operationIds },
        events: { some: { type: "OUTCOME", result: "SUCCEEDED" } },
      },
    });
    expect(successfulOperation).toMatchObject({
      action: "JOURNAL_ENTRY_SIGNED",
      targetType: "JOURNAL_ENTRY",
      targetId: draft.id,
      actorUserId: fixture.author.userId,
    });
    expect(JSON.stringify(successfulOperation)).not.toContain(saved.content);
  });

  it("rechecks access during signing and rolls back signing before recording FAILED", async () => {
    const fixture = await createFixture();
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OTHER",
        eventOccurredAt: eventOne,
        content: "Fiktivt utkast som förlorar åtkomst.",
      },
      fixture.author,
    );
    const operationId = generateAuditOperationId();

    await expect(
      signJournalDraftForTest(
        {
          operationId,
          journalEntryId: draft.id,
          expectedVersion: draft.version,
        },
        fixture.author,
        {
          beforeSigningTransaction: async () => {
            await prisma.assignment.updateMany({
              where: {
                organisationId: fixture.organisationId,
                clientId: fixture.firstClient.id,
                staffUserId: fixture.author.userId,
                endedAt: null,
              },
              data: { endedAt: new Date() },
            });
          },
        },
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: JournalEntryStatus.DRAFT });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("authorizes signed history by current Client access rather than historical authorship", async () => {
    const fixture = await createFixture();
    const signed = await createAndSignOriginal(fixture);

    await expect(
      listSignedJournalEntriesForTest(
        { clientId: fixture.firstClient.id },
        fixture.peer,
      ),
    ).resolves.toEqual([expect.objectContaining({ id: signed.id })]);
    await expect(
      listSignedJournalEntriesForTest(
        { clientId: fixture.firstClient.id },
        fixture.administrator,
      ),
    ).resolves.toEqual([expect.objectContaining({ id: signed.id })]);
    await expect(
      listSignedJournalEntriesForTest(
        { clientId: fixture.firstClient.id },
        fixture.unassigned,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });

    await prisma.assignment.updateMany({
      where: {
        organisationId: fixture.organisationId,
        clientId: fixture.firstClient.id,
        staffUserId: fixture.author.userId,
        endedAt: null,
      },
      data: { endedAt: new Date() },
    });
    await expect(
      getSignedJournalEntryForTest(
        { journalEntryId: signed.id },
        fixture.author,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      getSignedJournalEntryForTest({ journalEntryId: signed.id }, fixture.peer),
    ).resolves.toMatchObject({ id: signed.id });

    const foreign = await createFixture();
    await expect(
      getSignedJournalEntryForTest(
        { journalEntryId: signed.id },
        foreign.administrator,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      listSignedJournalEntriesForTest(
        { clientId: fixture.firstClient.id },
        foreign.administrator,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
  });

  it("protects signed rows at service and PostgreSQL levels while permitting the audited transition", async () => {
    const fixture = await createFixture();
    const signed = await createAndSignOriginal(fixture);

    await expect(
      saveJournalDraftForTest(
        {
          journalEntryId: signed.id,
          expectedVersion: signed.version,
          entryType: "OTHER",
          eventOccurredAt: eventTwo,
          content: "Administratören får inte ändra en signerad anteckning.",
        },
        fixture.administrator,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      prisma.journalEntry.update({
        where: { id: signed.id },
        data: { content: "Lägre nivå får inte ändra signerad text." },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.journalEntry.delete({ where: { id: signed.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.journalEntry.findUniqueOrThrow({ where: { id: signed.id } }),
    ).resolves.toMatchObject({
      content: "Fiktiv signerad originalanteckning.",
      status: JournalEntryStatus.SIGNED,
    });

    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.secondClient.id,
        entryType: "OTHER",
        eventOccurredAt: eventTwo,
        content: "Fiktivt utkast utan auditbevis.",
      },
      fixture.author,
    );
    await expect(
      prisma.journalEntry.update({
        where: { id: draft.id },
        data: {
          status: JournalEntryStatus.SIGNED,
          version: { increment: 1 },
          signedAt: new Date(),
          signerUserId: fixture.author.userId,
          signerName: fixture.author.name,
          signerProfessionalTitle: fixture.author.professionalTitle,
          signerRole: fixture.author.role,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: JournalEntryStatus.DRAFT });
  });

  it("rejects lower-level signing that changes the reviewed transition even with matching audit evidence", async () => {
    const fixture = await createFixture();
    const original = await createAndSignOriginal(fixture);
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "DAILY_NOTE",
        eventOccurredAt: eventOne,
        content: "Fiktivt granskat utkast för övergångsskydd.",
      },
      fixture.author,
    );
    const signedAt = new Date();
    const directSignedId = randomUUID();

    await expectRawSigningRejectedWithAuditEvidence(
      fixture,
      directSignedId,
      "JOURNAL_ENTRY_SIGNED",
      (transaction) =>
        transaction.$executeRaw`
          INSERT INTO "journalEntry" (
            "id", "reference", "organisationId", "clientId",
            "authorUserId", "status", "entryType", "eventOccurredAt",
            "content", "version", "createdAt", "updatedAt", "signedAt",
            "signerUserId", "signerName", "signerProfessionalTitle",
            "signerRole"
          ) VALUES (
            ${directSignedId}::uuid,
            ${`JRN-${randomUUID().toUpperCase()}`},
            ${fixture.organisationId},
            ${fixture.firstClient.id}::uuid,
            ${fixture.author.userId},
            'SIGNED'::"JournalEntryStatus",
            'OTHER'::"JournalEntryType",
            ${eventOne},
            ${"Fiktiv direkt signerad post som måste nekas."},
            2,
            ${signedAt},
            ${signedAt},
            ${signedAt},
            ${fixture.author.userId},
            ${fixture.author.name},
            ${fixture.author.professionalTitle},
            'STAFF_MEMBER'::"UserRole"
          )
        `,
    );

    await expectRawSigningRejectedWithAuditEvidence(
      fixture,
      draft.id,
      "JOURNAL_ENTRY_SIGNED",
      (transaction) => transaction.$executeRaw`
        UPDATE "journalEntry"
        SET "status" = 'SIGNED',
            "version" = ${draft.version + 1},
            "signedAt" = ${signedAt},
            "signerUserId" = ${fixture.author.userId},
            "signerName" = ${fixture.author.name},
            "signerProfessionalTitle" = ${fixture.author.professionalTitle},
            "signerRole" = 'STAFF_MEMBER',
            "content" = ${"Fiktivt ändrat innehåll under signering."}
        WHERE "id" = ${draft.id}::uuid
      `,
    );

    await expectRawSigningRejectedWithAuditEvidence(
      fixture,
      draft.id,
      "JOURNAL_ENTRY_SIGNED",
      (transaction) => transaction.$executeRaw`
        UPDATE "journalEntry"
        SET "status" = 'SIGNED',
            "version" = ${draft.version + 1},
            "signedAt" = ${signedAt},
            "signerUserId" = ${fixture.author.userId},
            "signerName" = ${fixture.author.name},
            "signerProfessionalTitle" = ${fixture.author.professionalTitle},
            "signerRole" = 'STAFF_MEMBER',
            "entryType" = 'OTHER'
        WHERE "id" = ${draft.id}::uuid
      `,
    );

    await expectRawSigningRejectedWithAuditEvidence(
      fixture,
      draft.id,
      "JOURNAL_ENTRY_SIGNED",
      (transaction) => transaction.$executeRaw`
        UPDATE "journalEntry"
        SET "status" = 'SIGNED',
            "version" = ${draft.version + 1},
            "signedAt" = ${signedAt},
            "signerUserId" = ${fixture.author.userId},
            "signerName" = ${fixture.author.name},
            "signerProfessionalTitle" = ${fixture.author.professionalTitle},
            "signerRole" = 'STAFF_MEMBER',
            "eventOccurredAt" = ${eventTwo}
        WHERE "id" = ${draft.id}::uuid
      `,
    );

    await expectRawSigningRejectedWithAuditEvidence(
      fixture,
      draft.id,
      "JOURNAL_ENTRY_SIGNED",
      (transaction) => transaction.$executeRaw`
        UPDATE "journalEntry"
        SET "status" = 'SIGNED',
            "version" = ${draft.version + 7},
            "signedAt" = ${signedAt},
            "signerUserId" = ${fixture.author.userId},
            "signerName" = ${fixture.author.name},
            "signerProfessionalTitle" = ${fixture.author.professionalTitle},
            "signerRole" = 'STAFF_MEMBER'
        WHERE "id" = ${draft.id}::uuid
      `,
    );

    await expectRawSigningRejectedWithAuditEvidence(
      fixture,
      draft.id,
      "JOURNAL_CORRECTION_SIGNED",
      (transaction) => transaction.$executeRaw`
        UPDATE "journalEntry"
        SET "status" = 'SIGNED',
            "version" = ${draft.version + 1},
            "signedAt" = ${signedAt},
            "signerUserId" = ${fixture.author.userId},
            "signerName" = ${fixture.author.name},
            "signerProfessionalTitle" = ${fixture.author.professionalTitle},
            "signerRole" = 'STAFF_MEMBER',
            "correctionOfId" = ${original.id}::uuid
        WHERE "id" = ${draft.id}::uuid
      `,
    );

    await expect(
      prisma.journalEntry.findUnique({ where: { id: directSignedId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({
      status: JournalEntryStatus.DRAFT,
      version: draft.version,
      entryType: draft.entryType,
      eventOccurredAt: draft.eventOccurredAt,
      content: draft.content,
      correctionOfId: null,
    });
  });

  it("creates flat, private, same-scope corrections and signs them with separate audit evidence", async () => {
    const fixture = await createFixture();
    const original = await createAndSignOriginal(fixture);
    const originalBefore = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: original.id },
    });
    const { draft: correction } = await beginJournalCorrectionForTest(
      {
        originalEntryId: original.id,
        entryType: "OTHER",
        eventOccurredAt: eventTwo,
        content: "Fiktiv rättelse till originalet.",
      },
      fixture.peer,
    );

    expect(correction).toMatchObject({
      status: JournalEntryStatus.DRAFT,
      correctionOfId: original.id,
      clientId: original.clientId,
    });
    await expect(
      getCurrentJournalDraftForTest(
        { clientId: fixture.firstClient.id },
        fixture.author,
      ),
    ).resolves.toBeNull();
    await expect(
      getCurrentJournalDraftForTest(
        { clientId: fixture.firstClient.id },
        fixture.administrator,
      ),
    ).resolves.toBeNull();
    await expect(
      saveJournalDraftForTest(
        {
          journalEntryId: correction.id,
          expectedVersion: correction.version,
          entryType: correction.entryType,
          eventOccurredAt: correction.eventOccurredAt,
          content: "Får inte sparas av administratör.",
        },
        fixture.administrator,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });

    const correctionOperationId = generateAuditOperationId();
    const signedCorrection = await signJournalDraftForTest(
      {
        operationId: correctionOperationId,
        journalEntryId: correction.id,
        expectedVersion: correction.version,
      },
      fixture.peer,
    );
    expect(signedCorrection.correctionOfId).toBe(original.id);
    await expect(
      prisma.journalEntry.findUniqueOrThrow({ where: { id: original.id } }),
    ).resolves.toEqual(originalBefore);
    await expect(
      prisma.auditOperation.findUniqueOrThrow({
        where: { id: correctionOperationId },
      }),
    ).resolves.toMatchObject({
      action: "JOURNAL_CORRECTION_SIGNED",
      targetType: "JOURNAL_ENTRY",
      targetId: correction.id,
      actorUserId: fixture.peer.userId,
    });
    await expect(
      getSignedJournalEntryForTest(
        { journalEntryId: original.id },
        fixture.administrator,
      ),
    ).resolves.toMatchObject({
      id: original.id,
      corrections: [expect.objectContaining({ id: correction.id })],
    });

    await expect(
      beginJournalCorrectionForTest(
        {
          originalEntryId: signedCorrection.id,
          entryType: "OTHER",
          eventOccurredAt: eventTwo,
          content: "Rättelse av rättelse får inte skapas.",
        },
        fixture.administrator,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });

    const adminCorrection = await beginJournalCorrectionForTest(
      {
        originalEntryId: original.id,
        entryType: "OTHER",
        eventOccurredAt: eventTwo,
        content: "Fiktiv administratörsrättelse.",
      },
      fixture.administrator,
    );
    expect(adminCorrection.created).toBe(true);
    await discardJournalDraftForTest(
      {
        journalEntryId: adminCorrection.draft.id,
        expectedVersion: adminCorrection.draft.version,
      },
      fixture.administrator,
    );
  });

  it("rejects draft, cross-Client, cross-Organisation and competing-draft correction targets", async () => {
    const fixture = await createFixture();
    const original = await createAndSignOriginal(fixture);
    const normalDraft = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OTHER",
        eventOccurredAt: eventTwo,
        content: "Fiktivt vanligt kollegautkast.",
      },
      fixture.peer,
    );
    await expect(
      beginJournalCorrectionForTest(
        {
          originalEntryId: original.id,
          entryType: "OTHER",
          eventOccurredAt: eventTwo,
          content: "Får inte kringgå ett öppet utkast.",
        },
        fixture.peer,
      ),
    ).rejects.toMatchObject({ code: "OPEN_DRAFT_CONFLICT" });
    await expect(
      beginJournalCorrectionForTest(
        {
          originalEntryId: normalDraft.draft.id,
          entryType: "OTHER",
          eventOccurredAt: eventTwo,
          content: "Ett utkast får inte vara rättelsemål.",
        },
        fixture.administrator,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });

    await expect(
      prisma.journalEntry.create({
        data: {
          id: randomUUID(),
          reference: `JRN-${randomUUID().toUpperCase()}`,
          organisationId: fixture.organisationId,
          clientId: fixture.secondClient.id,
          authorUserId: fixture.author.userId,
          entryType: "OTHER",
          eventOccurredAt: eventTwo,
          content: "Fiktiv ogiltig cross-Client-rättelse.",
          correctionOfId: original.id,
        },
      }),
    ).rejects.toThrow();

    const foreign = await createFixture();
    await expect(
      prisma.journalEntry.create({
        data: {
          id: randomUUID(),
          reference: `JRN-${randomUUID().toUpperCase()}`,
          organisationId: foreign.organisationId,
          clientId: foreign.firstClient.id,
          authorUserId: foreign.author.userId,
          entryType: "OTHER",
          eventOccurredAt: eventTwo,
          content: "Fiktiv ogiltig cross-Organisation-rättelse.",
          correctionOfId: original.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("rolls back a failed protected signing mutation without false success evidence", async () => {
    const fixture = await createFixture();
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OBSERVATION",
        eventOccurredAt: eventOne,
        content: "Fiktivt utkast för återställningstest.",
      },
      fixture.author,
    );
    const operationId = generateAuditOperationId();

    await expect(
      signJournalDraftForTest(
        {
          operationId,
          journalEntryId: draft.id,
          expectedVersion: draft.version,
        },
        fixture.author,
        {
          afterSigningMutation: () => {
            throw new Error("Fictional forced signing rollback");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    await expect(
      prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({
      status: JournalEntryStatus.DRAFT,
      signedAt: null,
    });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
    await expect(
      prisma.auditEvent.count({
        where: { operationId, result: "SUCCEEDED" },
      }),
    ).resolves.toBe(0);
  });

  it("classifies a deferred commit-time database rejection as FAILED", async () => {
    const fixture = await createFixture();
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OBSERVATION",
        eventOccurredAt: eventOne,
        content: "Fiktivt huvudutkast för commit-test.",
      },
      fixture.author,
    );
    const { draft: unauditedDraft } = await createJournalDraftForTest(
      {
        clientId: fixture.secondClient.id,
        entryType: "OTHER",
        eventOccurredAt: eventTwo,
        content: "Fiktivt utkast som orsakar uppskjutet databasfel.",
      },
      fixture.author,
    );
    const operationId = generateAuditOperationId();

    await expect(
      signJournalDraftForTest(
        {
          operationId,
          journalEntryId: draft.id,
          expectedVersion: draft.version,
        },
        fixture.author,
        {
          afterSigningAuditOutcome: async (transaction) => {
            await transaction.journalEntry.update({
              where: { id: unauditedDraft.id },
              data: {
                status: JournalEntryStatus.SIGNED,
                version: { increment: 1 },
                signedAt: new Date(),
                signerUserId: fixture.author.userId,
                signerName: fixture.author.name,
                signerProfessionalTitle: fixture.author.professionalTitle,
                signerRole: fixture.author.role,
              },
            });
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });

    for (const entryId of [draft.id, unauditedDraft.id]) {
      await expect(
        prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId } }),
      ).resolves.toMatchObject({
        status: JournalEntryStatus.DRAFT,
        signedAt: null,
      });
    }
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
    await expect(
      prisma.auditEvent.count({ where: { operationId, result: "SUCCEEDED" } }),
    ).resolves.toBe(0);
  });

  it("waits for an in-flight signing commit before classifying completion", async () => {
    const fixture = await createFixture();
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OBSERVATION",
        eventOccurredAt: eventOne,
        content: "Fiktivt utkast för synkroniserad commit-verifiering.",
      },
      fixture.author,
    );
    const intent = await createUserAuditIntent({
      operationId: generateAuditOperationId(),
      actor: fixture.author,
      action: "JOURNAL_ENTRY_SIGNED",
      target: { targetId: draft.id },
    });
    const signingReady = Promise.withResolvers<void>();
    const releaseSigning = Promise.withResolvers<void>();

    const signingTransaction = prisma
      .$transaction(
        async (transaction) => {
          await lockClientForMutation(transaction, fixture.firstClient.id);
          await transaction.journalEntry.update({
            where: { id: draft.id },
            data: {
              status: JournalEntryStatus.SIGNED,
              version: { increment: 1 },
              signedAt: new Date(),
              signerUserId: fixture.author.userId,
              signerName: fixture.author.name,
              signerProfessionalTitle: fixture.author.professionalTitle,
              signerRole: fixture.author.role,
            },
          });
          await appendAuditOutcomeInTransaction(
            transaction,
            intent,
            "SUCCEEDED",
            draft.id,
          );
          signingReady.resolve();
          await releaseSigning.promise;
        },
        { timeout: 15_000 },
      )
      .then(
        () => ({ committed: true as const }),
        (error: unknown) => ({ committed: false as const, error }),
      );

    await signingReady.promise;
    let verificationSettled = false;
    const verification = verifySigningTransactionCompletionForTest(
      intent,
      fixture.author,
      fixture.firstClient.id,
      draft.id,
      draft.version,
    ).then((result) => {
      verificationSettled = true;
      return result;
    });

    await waitForClientMutationLockWaiter(fixture.firstClient.id);
    expect(verificationSettled).toBe(false);
    releaseSigning.resolve();

    await expect(signingTransaction).resolves.toEqual({ committed: true });
    await expect(verification).resolves.toMatchObject({
      state: "COMPLETED",
      value: { id: draft.id, status: JournalEntryStatus.SIGNED },
    });
    await expect(
      prisma.auditEvent.count({
        where: { operationId: intent.operationId, result: "SUCCEEDED" },
      }),
    ).resolves.toBe(1);
  });

  it("waits for an in-flight signing rollback before classifying non-completion", async () => {
    const fixture = await createFixture();
    const { draft } = await createJournalDraftForTest(
      {
        clientId: fixture.firstClient.id,
        entryType: "OBSERVATION",
        eventOccurredAt: eventOne,
        content: "Fiktivt utkast för synkroniserad rollback-verifiering.",
      },
      fixture.author,
    );
    const intent = await createUserAuditIntent({
      operationId: generateAuditOperationId(),
      actor: fixture.author,
      action: "JOURNAL_ENTRY_SIGNED",
      target: { targetId: draft.id },
    });
    const signingReady = Promise.withResolvers<void>();
    const releaseSigning = Promise.withResolvers<void>();

    const signingTransaction = prisma
      .$transaction(
        async (transaction) => {
          await lockClientForMutation(transaction, fixture.firstClient.id);
          await transaction.journalEntry.update({
            where: { id: draft.id },
            data: {
              status: JournalEntryStatus.SIGNED,
              version: { increment: 1 },
              signedAt: new Date(),
              signerUserId: fixture.author.userId,
              signerName: fixture.author.name,
              signerProfessionalTitle: fixture.author.professionalTitle,
              signerRole: fixture.author.role,
            },
          });
          await appendAuditOutcomeInTransaction(
            transaction,
            intent,
            "SUCCEEDED",
            draft.id,
          );
          signingReady.resolve();
          await releaseSigning.promise;
          throw new Error("Fictional forced in-flight rollback");
        },
        { timeout: 15_000 },
      )
      .then(
        () => ({ rolledBack: false as const }),
        () => ({ rolledBack: true as const }),
      );

    await signingReady.promise;
    let verificationSettled = false;
    const verification = verifySigningTransactionCompletionForTest(
      intent,
      fixture.author,
      fixture.firstClient.id,
      draft.id,
      draft.version,
    ).then((result) => {
      verificationSettled = true;
      return result;
    });

    await waitForClientMutationLockWaiter(fixture.firstClient.id);
    expect(verificationSettled).toBe(false);
    releaseSigning.resolve();

    await expect(signingTransaction).resolves.toEqual({ rolledBack: true });
    await expect(verification).resolves.toEqual({ state: "ROLLED_BACK" });
    await expect(
      prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({
      status: JournalEntryStatus.DRAFT,
      version: draft.version,
    });
    await expect(
      prisma.auditEvent.findUnique({
        where: {
          operationId_type: {
            operationId: intent.operationId,
            type: "OUTCOME",
          },
        },
      }),
    ).resolves.toBeNull();
  });

  it("installs the reviewed draft, correction, immutability and audit-evidence database mechanisms", async () => {
    const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS "name"
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'journalEntry'
    `;
    const triggers = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT tgname AS "name"
      FROM pg_trigger
      WHERE tgrelid = '"journalEntry"'::regclass AND NOT tgisinternal
    `;
    const constraints = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS "name"
      FROM pg_constraint
      WHERE conrelid = '"journalEntry"'::regclass
    `;

    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "journalEntry_one_open_draft_per_author_client_key",
        "journalEntry_organisationId_clientId_status_eventOccurred_idx",
      ]),
    );
    expect(triggers.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "journalEntry_validate_identity_and_correction",
        "journalEntry_prevent_signed_update_delete",
        "journalEntry_prevent_truncate",
        "journalEntry_require_signing_audit",
      ]),
    );
    expect(constraints.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "journalEntry_signing_state_check",
        "journalEntry_positive_version_check",
        "journalEntry_organisationId_clientId_correctionOfId_fkey",
      ]),
    );
  });
});
