import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  AssignmentResponsibility,
  ClientStatus,
  PrismaClient,
  UserRole,
} from "../src/generated/prisma/client";
import {
  addCalendarDays,
  formatStockholmCalendarDate,
  parseCalendarDate,
} from "../src/lib/stockholm-time";
import { createAuthentication } from "../src/modules/authentication/auth";
import { getTestEnvironment } from "../src/test/test-environment";

const testEnvironment = getTestEnvironment();
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: testEnvironment.integrationDatabaseUrl,
  }),
});
const fixtureAuthentication = createAuthentication(prisma);
const organisationPrefix = "Fiktiv M4 UI-organisation ";
const administratorEmail = "m4.ui.administrator@example.test";
const ownerEmail = "m4.ui.owner@example.test";
const peerEmail = "m4.ui.peer@example.test";
const unrelatedEmail = "m4.ui.unrelated@example.test";
const password = "Fictional M4 UI password 2032";
const rateLimitKeys = new Set<string>();

type Fixtures = Awaited<ReturnType<typeof createFixtures>>;
let fixtures: Fixtures;

async function cleanupOrganisations(organisationIds: readonly string[]) {
  if (organisationIds.length === 0) return;
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
        where: { organisationId: { in: [...organisationIds] } },
      });
      await transaction.journalEntry.deleteMany({
        where: { organisationId: { in: [...organisationIds] } },
      });
      await transaction.followUpResponsibilityHistory.deleteMany({
        where: { organisationId: { in: [...organisationIds] } },
      });
      await transaction.followUp.deleteMany({
        where: { organisationId: { in: [...organisationIds] } },
      });
      await transaction.goal.deleteMany({
        where: { organisationId: { in: [...organisationIds] } },
      });
    } finally {
      for (const table of [...protectedTables].reverse()) {
        await transaction.$executeRawUnsafe(
          `ALTER TABLE "${table}" ENABLE TRIGGER USER`,
        );
      }
    }
    await transaction.assignment.deleteMany({
      where: { organisationId: { in: [...organisationIds] } },
    });
    await transaction.session.deleteMany({
      where: { user: { organisationId: { in: [...organisationIds] } } },
    });
    await transaction.account.deleteMany({
      where: { user: { organisationId: { in: [...organisationIds] } } },
    });
    await transaction.client.deleteMany({
      where: { organisationId: { in: [...organisationIds] } },
    });
    await transaction.user.deleteMany({
      where: { organisationId: { in: [...organisationIds] } },
    });
    await transaction.organisation.deleteMany({
      where: { id: { in: [...organisationIds] } },
    });
  });
}

async function createUser(
  organisationId: string,
  name: string,
  email: string,
  role: UserRole,
) {
  await fixtureAuthentication.api.createUser({
    body: {
      name,
      email,
      password,
      role,
      data: {
        organisationId,
        professionalTitle:
          role === UserRole.ADMINISTRATOR
            ? "Fiktiv verksamhetsansvarig"
            : "Fiktiv behandlare",
        mustChangePassword: false,
        temporaryCredentialExpiresAt: null,
      },
    },
  });
  return prisma.user.findUniqueOrThrow({ where: { email } });
}

async function createFixtures() {
  const organisationId = randomUUID();
  await prisma.organisation.create({
    data: {
      id: organisationId,
      name: `${organisationPrefix}${organisationId}`,
    },
  });
  const [administrator, owner, peer, unrelated] = await Promise.all([
    createUser(
      organisationId,
      "Fiktiv M4-administratör",
      administratorEmail,
      UserRole.ADMINISTRATOR,
    ),
    createUser(
      organisationId,
      "Fiktiv Planeringsägare",
      ownerEmail,
      UserRole.STAFF_MEMBER,
    ),
    createUser(
      organisationId,
      "Fiktiv Planeringskollega",
      peerEmail,
      UserRole.STAFF_MEMBER,
    ),
    createUser(
      organisationId,
      "Fiktiv Obehörig",
      unrelatedEmail,
      UserRole.STAFF_MEMBER,
    ),
  ]);
  const activeClient = await prisma.client.create({
    data: {
      id: randomUUID(),
      organisationId,
      firstName: "Fiktiv",
      lastName: "Planeringsklient med mycket långt namn för radbrytning",
      personIdentifier: "M4-UI-AKTIV-LÅNG-REFERENS-012345678901234567890123",
      category: "ADULT",
      status: ClientStatus.ACTIVE,
    },
  });
  await prisma.assignment.createMany({
    data: [
      {
        id: randomUUID(),
        organisationId,
        clientId: activeClient.id,
        staffUserId: peer.id,
        responsibility: AssignmentResponsibility.PRIMARY,
        createdByUserId: administrator.id,
      },
      {
        id: randomUUID(),
        organisationId,
        clientId: activeClient.id,
        staffUserId: owner.id,
        responsibility: AssignmentResponsibility.SECONDARY,
        createdByUserId: administrator.id,
      },
    ],
  });
  const archivedClient = await prisma.client.create({
    data: {
      id: randomUUID(),
      organisationId,
      firstName: "Fiktiv",
      lastName: "Arkiverad planeringsklient",
      personIdentifier: "M4-UI-ARKIVERAD",
      category: "YOUTH",
      status: ClientStatus.ARCHIVED,
      archivedAt: new Date(),
    },
  });
  const archivedGoal = await prisma.goal.create({
    data: {
      id: randomUUID(),
      organisationId,
      clientId: archivedClient.id,
      title: "Historiskt mål för arkiverad klient",
      startDate: parseCalendarDate("2026-06-01")!,
      createdByUserId: administrator.id,
    },
  });
  const archivedFollowUp = await prisma.followUp.create({
    data: {
      id: randomUUID(),
      organisationId,
      clientId: archivedClient.id,
      title: "Historisk uppföljning för arkiverad klient",
      dueDate: parseCalendarDate("2026-06-15")!,
      createdByUserId: administrator.id,
      responsibleUserId: administrator.id,
      goalId: archivedGoal.id,
    },
  });
  return {
    organisationId,
    administrator,
    owner,
    peer,
    unrelated,
    activeClient,
    archivedClient,
    archivedGoal,
    archivedFollowUp,
  };
}

async function logIn(page: Page, email: string, ipAddress: string) {
  rateLimitKeys.add(`${ipAddress}|/sign-in/email`);
  await page.setExtraHTTPHeaders({ "x-real-ip": ipAddress });
  await page.goto("/login");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord").fill(password);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);
}

async function newSignedInPage(
  context: BrowserContext,
  email: string,
  ipAddress: string,
) {
  const page = await context.newPage();
  await logIn(page, email, ipAddress);
  return page;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
}

async function enableTwoHundredPercentText(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
}

async function expectVisibleFocus(target: Locator) {
  await expect(target).toBeFocused();
  await expect(
    target.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).resolves.not.toBe("none");
}

async function tabTo(page: Page, target: Locator, maximumTabs = 35) {
  for (let step = 0; step < maximumTabs; step += 1) {
    await page.keyboard.press("Tab");
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }
  await expect(target).toBeFocused();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const stale = await prisma.organisation.findMany({
    where: { name: { startsWith: organisationPrefix } },
    select: { id: true },
  });
  await cleanupOrganisations(stale.map(({ id }) => id));
  fixtures = await createFixtures();
});

test.afterAll(async () => {
  if (fixtures) await cleanupOrganisations([fixtures.organisationId]);
  if (rateLimitKeys.size > 0) {
    await prisma.rateLimit.deleteMany({
      where: { key: { in: [...rateLimitKeys] } },
    });
  }
  await prisma.$disconnect();
});

test("Home orders multiple own Follow-ups by urgency within each group", async ({
  page,
}) => {
  const { activeClient, administrator, owner } = fixtures;
  const today = formatStockholmCalendarDate(new Date());
  const rows = [
    { title: "Ordning försenad äldst", offset: -8 },
    { title: "Ordning försenad närmast", offset: -2 },
    { title: "Ordning kommande närmast", offset: 2 },
    { title: "Ordning kommande sist", offset: 6 },
  ];
  for (const row of rows) {
    await prisma.followUp.create({
      data: {
        id: randomUUID(),
        organisationId: fixtures.organisationId,
        clientId: activeClient.id,
        title: row.title,
        dueDate: parseCalendarDate(addCalendarDays(today, row.offset))!,
        createdByUserId: administrator.id,
        responsibleUserId: owner.id,
      },
    });
  }

  await logIn(page, ownerEmail, "192.0.2.230");
  const overdueGroup = page.locator(".home-follow-up-group").filter({
    has: page.getByRole("heading", { name: "Försenade" }),
  });
  const upcomingGroup = page.locator(".home-follow-up-group").filter({
    has: page.getByRole("heading", { name: "Kommande" }),
  });

  await expect(
    overdueGroup.getByRole("link").allTextContents(),
  ).resolves.toEqual([
    expect.stringContaining("Ordning försenad närmast"),
    expect.stringContaining("Ordning försenad äldst"),
  ]);
  await expect(
    upcomingGroup.getByRole("link").allTextContents(),
  ).resolves.toEqual([
    expect.stringContaining("Ordning kommande närmast"),
    expect.stringContaining("Ordning kommande sist"),
  ]);
});

test("Client workspace supports Goal and Follow-up lifecycles with terminal and stale protection", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const { activeClient, owner, peer } = fixtures;
  await logIn(page, ownerEmail, "192.0.2.231");
  await page.goto(`/klienter/${activeClient.id}`);
  for (const destination of [
    "Översikt",
    "Anteckningar",
    "Mål",
    "Uppföljningar",
  ]) {
    await expect(page.getByRole("link", { name: destination })).toBeVisible();
  }

  await page.getByRole("link", { name: "Mål", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Mål", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Nytt mål" }).click();
  await expect(page.getByLabel("Startdatum")).toHaveValue(
    formatStockholmCalendarDate(new Date()),
  );
  await page.getByLabel("Rubrik").fill("Tryggare vardagsrutiner");
  await page
    .getByLabel("Beskrivning (valfritt)")
    .fill("Fiktiv planering för stabila vardagsrutiner.");
  await page.getByRole("button", { name: "Skapa mål" }).click();
  await expect(page.getByText("Målet har skapats.")).toBeVisible();
  const firstGoal = await prisma.goal.findFirstOrThrow({
    where: { clientId: activeClient.id, title: "Tryggare vardagsrutiner" },
  });

  await page.getByRole("link", { name: "Redigera" }).click();
  await page.getByLabel("Rubrik").fill("Tryggare vardagsrutiner tillsammans");
  await page.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(page.getByText("Målet har sparats.")).toBeVisible();
  await page.getByRole("button", { name: "Pausa" }).click();
  await expect(page.getByText("Pausat", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Återuppta" }).click();
  await expect(page.getByText("Aktivt", { exact: true })).toBeVisible();

  await page.goto(`/klienter/${activeClient.id}/mal/nytt`);
  await page.getByLabel("Rubrik").fill("Mål som ska arkiveras");
  await page.getByRole("button", { name: "Skapa mål" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Arkivera" }).click();
  await expect(page.getByText("Arkiverat", { exact: true })).toBeVisible();
  await expect(page.getByText("Arkiverad den", { exact: true })).toBeVisible();
  await expect(
    page
      .getByText("Arkiverad den", { exact: true })
      .locator("..")
      .locator("time"),
  ).toHaveAttribute("datetime", /.+/);
  await expect(page.getByRole("link", { name: "Redigera" })).toHaveCount(0);

  await page.goto(`/klienter/${activeClient.id}/mal/${firstGoal.id}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Markera som slutfört" }).click();
  await expect(page.getByText("Slutfört", { exact: true })).toBeVisible();
  await expect(page.getByText("Slutförd den", { exact: true })).toBeVisible();
  await expect(
    page
      .getByText("Slutförd den", { exact: true })
      .locator("..")
      .locator("time"),
  ).toHaveAttribute("datetime", /.+/);
  await expect(page.getByRole("link", { name: "Redigera" })).toHaveCount(0);
  const terminalResponse = await page.goto(
    `/klienter/${activeClient.id}/mal/${firstGoal.id}/redigera`,
  );
  expect(terminalResponse?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await expect(page.getByText(firstGoal.title, { exact: true })).toHaveCount(0);

  const linkedGoal = await prisma.goal.create({
    data: {
      id: randomUUID(),
      organisationId: fixtures.organisationId,
      clientId: activeClient.id,
      title: "Aktuellt mål för uppföljning",
      startDate: parseCalendarDate(formatStockholmCalendarDate(new Date()))!,
      createdByUserId: owner.id,
    },
  });
  const yesterday = addCalendarDays(
    formatStockholmCalendarDate(new Date()),
    -1,
  );
  await page.goto(`/klienter/${activeClient.id}/uppfoljningar/ny`);
  await page.getByLabel("Rubrik").fill("Kontakta fiktivt nätverk");
  await page.getByLabel("Datum för uppföljning").fill(yesterday);
  await page
    .getByLabel("Ansvarig medarbetare")
    .selectOption({ label: "Fiktiv Planeringsägare – Fiktiv behandlare" });
  await page.getByLabel("Kopplat mål (valfritt)").selectOption(linkedGoal.id);
  await page.getByRole("button", { name: "Skapa uppföljning" }).click();
  await expect(page.getByText("Uppföljningen har skapats.")).toBeVisible();
  await expect(page.getByText(/^Försenad:/)).toBeVisible();
  const firstFollowUp = await prisma.followUp.findFirstOrThrow({
    where: { clientId: activeClient.id, title: "Kontakta fiktivt nätverk" },
  });

  await page.getByRole("link", { name: "Redigera uppföljning" }).click();
  await page.getByLabel("Rubrik").fill("Kontakta fiktivt nätverk före möte");
  await page
    .getByLabel("Beskrivning (valfritt)")
    .fill("Fiktivt innehåll som sparas före ansvarigbytet.");
  await expect(
    page.getByRole("combobox", { name: "Byt ansvarig" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(page.getByText("Uppföljningen har sparats.")).toBeVisible();
  await expect(
    page.getByText("Fiktivt innehåll som sparas före ansvarigbytet."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Byt ansvarig" }).click();
  await expect(page.getByLabel("Beskrivning (valfritt)")).toHaveCount(0);
  await expect(
    page.getByText(/Det här sparar endast ansvarig medarbetare/),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Byt ansvarig" })
    .selectOption({ label: "Fiktiv Planeringskollega – Fiktiv behandlare" });
  await page.getByRole("button", { name: "Spara ansvarig" }).click();
  await expect(page.getByText("Ansvarig har uppdaterats.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tidigare ansvar" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Fiktiv Planeringsägare → Fiktiv Planeringskollega/),
  ).toBeVisible();
  await expect(
    prisma.followUp.findUniqueOrThrow({ where: { id: firstFollowUp.id } }),
  ).resolves.toMatchObject({
    title: "Kontakta fiktivt nätverk före möte",
    description: "Fiktivt innehåll som sparas före ansvarigbytet.",
    responsibleUserId: peer.id,
  });
  await expect(
    prisma.auditEvent.count({
      where: {
        result: "SUCCEEDED",
        operation: {
          action: "FOLLOW_UP_REASSIGNED",
          targetId: firstFollowUp.id,
        },
      },
    }),
  ).resolves.toBe(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Avbryt uppföljning" }).click();
  await expect(page.getByText("Avbruten", { exact: true })).toBeVisible();
  await expect(page.getByText("Avbruten den", { exact: true })).toBeVisible();
  await expect(
    page
      .getByText("Avbruten den", { exact: true })
      .locator("..")
      .locator("time"),
  ).toHaveAttribute("datetime", /.+/);
  await expect(page.getByRole("link", { name: /Redigera/ })).toHaveCount(0);
  await page.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${firstFollowUp.id}/redigera`,
  );
  await expect(
    page.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await page.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${firstFollowUp.id}/ansvarig`,
  );
  await expect(
    page.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();

  await page.goto(`/klienter/${activeClient.id}/uppfoljningar/ny`);
  await page.getByLabel("Rubrik").fill("Slutförbar fiktiv uppföljning");
  await page
    .getByLabel("Datum för uppföljning")
    .fill(addCalendarDays(formatStockholmCalendarDate(new Date()), 2));
  await page.getByLabel("Ansvarig medarbetare").selectOption(peer.id);
  await page.getByRole("button", { name: "Skapa uppföljning" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Markera som slutförd" }).click();
  await expect(page.getByText("Slutförd", { exact: true })).toBeVisible();
  await expect(page.getByText("Slutförd den", { exact: true })).toBeVisible();
  await expect(
    page
      .getByText("Slutförd den", { exact: true })
      .locator("..")
      .locator("time"),
  ).toHaveAttribute("datetime", /.+/);
  await expect(page.getByText(/journalanteckning/i)).toHaveCount(0);

  await page.goto(`/klienter/${activeClient.id}/uppfoljningar/ny`);
  await page.getByLabel("Rubrik").fill("Konfliktuppföljning");
  await page
    .getByLabel("Datum för uppföljning")
    .fill(addCalendarDays(formatStockholmCalendarDate(new Date()), 3));
  await page.getByLabel("Ansvarig medarbetare").selectOption(owner.id);
  await page.getByRole("button", { name: "Skapa uppföljning" }).click();
  await expect(page.getByText("Uppföljningen har skapats.")).toBeVisible();
  const staleFollowUp = await prisma.followUp.findFirstOrThrow({
    where: { clientId: activeClient.id, title: "Konfliktuppföljning" },
  });
  await page.getByRole("link", { name: "Redigera uppföljning" }).click();
  const stalePage = await context.newPage();
  await stalePage.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${staleFollowUp.id}/redigera`,
  );
  await page.getByLabel("Rubrik").fill("Nyare sparad uppföljning");
  await page.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(page.getByText("Uppföljningen har sparats.")).toBeVisible();
  await stalePage.getByLabel("Rubrik").fill("Får inte skriva över");
  await stalePage.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(stalePage.getByText(/ändrats i en annan session/)).toBeVisible();
  await expect(
    prisma.followUp.findUniqueOrThrow({ where: { id: staleFollowUp.id } }),
  ).resolves.toMatchObject({ title: "Nyare sparad uppföljning" });
  await stalePage.close();
});

test("Goal, Follow-up, responsibility, and Journal controls work from the keyboard", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { activeClient, administrator, owner, peer } = fixtures;
  const today = formatStockholmCalendarDate(new Date());
  const [pauseGoal] = await Promise.all(
    [
      "Tangentbordsmål att pausa",
      "Tangentbordsmål ett",
      "Tangentbordsmål två",
    ].map((title) =>
      prisma.goal.create({
        data: {
          id: randomUUID(),
          organisationId: fixtures.organisationId,
          clientId: activeClient.id,
          title,
          startDate: parseCalendarDate(today)!,
          createdByUserId: peer.id,
        },
      }),
    ),
  );
  const [completeFollowUp, reassignFollowUp] = await Promise.all([
    prisma.followUp.create({
      data: {
        id: randomUUID(),
        organisationId: fixtures.organisationId,
        clientId: activeClient.id,
        title: "Tangentbordsuppföljning att slutföra",
        dueDate: parseCalendarDate(addCalendarDays(today, 1))!,
        createdByUserId: administrator.id,
        responsibleUserId: peer.id,
      },
    }),
    prisma.followUp.create({
      data: {
        id: randomUUID(),
        organisationId: fixtures.organisationId,
        clientId: activeClient.id,
        title: "Tangentbordsuppföljning att byta ansvarig för",
        dueDate: parseCalendarDate(addCalendarDays(today, 2))!,
        createdByUserId: administrator.id,
        responsibleUserId: owner.id,
      },
    }),
  ]);

  await logIn(page, peerEmail, "192.0.2.236");
  await page.goto(`/klienter/${activeClient.id}/mal/${pauseGoal.id}`);
  const pauseButton = page.getByRole("button", { name: "Pausa" });
  await tabTo(page, pauseButton);
  await expectVisibleFocus(pauseButton);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Pausat", { exact: true })).toBeVisible();

  await page.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${completeFollowUp.id}`,
  );
  const completeButton = page.getByRole("button", {
    name: "Markera som slutförd",
  });
  await tabTo(page, completeButton);
  await expectVisibleFocus(completeButton);
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Enter");
  await expect(page.getByText("Slutförd", { exact: true })).toBeVisible();

  await page.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${reassignFollowUp.id}/ansvarig`,
  );
  await expect(page.getByLabel("Beskrivning (valfritt)")).toHaveCount(0);
  const responsibleSelect = page.getByRole("combobox", {
    name: "Byt ansvarig",
  });
  await tabTo(page, responsibleSelect);
  await expectVisibleFocus(responsibleSelect);
  const responsibleOptions = await responsibleSelect
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
  const peerOptionIndex = responsibleOptions.indexOf(peer.id);
  expect(peerOptionIndex).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Home");
  for (let optionIndex = 0; optionIndex < peerOptionIndex; optionIndex += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(responsibleSelect).toHaveValue(peer.id);
  const saveResponsibleButton = page.getByRole("button", {
    name: "Spara ansvarig",
  });
  await tabTo(page, saveResponsibleButton);
  await expectVisibleFocus(saveResponsibleButton);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Ansvarig har uppdaterats.")).toBeVisible();

  await page.goto(`/klienter/${activeClient.id}/anteckningar/utkast`);
  await page
    .getByRole("textbox", { name: "Övrigt", exact: true })
    .fill("Fiktivt tangentbordstest av målval.");
  const keyboardGoalCheckboxes = page
    .locator(".journal-goal-options label")
    .filter({ hasText: /Tangentbordsmål (ett|två)/ })
    .getByRole("checkbox");
  await expect(keyboardGoalCheckboxes).toHaveCount(2);
  const firstGoalCheckbox = keyboardGoalCheckboxes.first();
  const secondGoalCheckbox = keyboardGoalCheckboxes.nth(1);
  await tabTo(page, firstGoalCheckbox);
  await expectVisibleFocus(firstGoalCheckbox);
  await page.keyboard.press("Space");
  await expect(firstGoalCheckbox).toBeChecked();
  await tabTo(page, secondGoalCheckbox);
  await expectVisibleFocus(secondGoalCheckbox);
  await page.keyboard.press("Space");
  await expect(secondGoalCheckbox).toBeChecked();
  const saveDraftButton = page.getByRole("button", { name: "Spara utkast" });
  await tabTo(page, saveDraftButton);
  await expectVisibleFocus(saveDraftButton);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Utkastet har sparats.")).toBeVisible();
  const discardButton = page.getByRole("button", { name: "Kasta utkast" });
  await tabTo(page, discardButton);
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Enter");
  await expect(page.getByText("Utkastet har kastats.")).toBeVisible();
});

test("Goal and Follow-up detail and edit views reflow at 375px and 200% text", async ({
  page,
}) => {
  const { activeClient, administrator, peer } = fixtures;
  const today = formatStockholmCalendarDate(new Date());
  const longGoalTitle =
    "Mycket långt mål för kontroll av läsbar radbrytning vid tvåhundra procents textförstoring utan dold information";
  const longFollowUpTitle =
    "Mycket lång uppföljning för kontroll av läsbar radbrytning vid tvåhundra procents textförstoring utan dold information";
  const goal = await prisma.goal.create({
    data: {
      id: randomUUID(),
      organisationId: fixtures.organisationId,
      clientId: activeClient.id,
      title: longGoalTitle,
      startDate: parseCalendarDate(today)!,
      createdByUserId: peer.id,
    },
  });
  const followUp = await prisma.followUp.create({
    data: {
      id: randomUUID(),
      organisationId: fixtures.organisationId,
      clientId: activeClient.id,
      title: longFollowUpTitle,
      dueDate: parseCalendarDate(addCalendarDays(today, 4))!,
      createdByUserId: administrator.id,
      responsibleUserId: peer.id,
      goalId: goal.id,
    },
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, peerEmail, "192.0.2.237");
  const destinations = [
    {
      path: `/klienter/${activeClient.id}/mal/${goal.id}`,
      heading: longGoalTitle,
      action: "Redigera",
    },
    {
      path: `/klienter/${activeClient.id}/mal/${goal.id}/redigera`,
      heading: "Redigera mål",
      action: "Spara ändringar",
    },
    {
      path: `/klienter/${activeClient.id}/uppfoljningar/${followUp.id}`,
      heading: longFollowUpTitle,
      action: "Redigera uppföljning",
    },
    {
      path: `/klienter/${activeClient.id}/uppfoljningar/${followUp.id}/redigera`,
      heading: "Redigera uppföljning",
      action: "Spara ändringar",
    },
    {
      path: `/klienter/${activeClient.id}/uppfoljningar/${followUp.id}/ansvarig`,
      heading: "Byt ansvarig",
      action: "Spara ansvarig",
    },
  ];

  for (const destination of destinations) {
    await page.goto(destination.path);
    await enableTwoHundredPercentText(page);
    await expect(
      page.getByRole("heading", { name: destination.heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole(
        destination.action.startsWith("Redigera") ? "link" : "button",
        {
          name: destination.action,
        },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Mål", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Uppföljningar", exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("Home shows only own authorised Follow-ups and archived/access-loss views fail closed", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  const { activeClient, administrator, owner, peer } = fixtures;
  const today = formatStockholmCalendarDate(new Date());
  const homeRows = [
    {
      title: "Hem försenad",
      date: addCalendarDays(today, -1),
      userId: owner.id,
    },
    { title: "Hem idag", date: today, userId: owner.id },
    {
      title: "Hem kommande",
      date: addCalendarDays(today, 3),
      userId: owner.id,
    },
    { title: "Hem annan användare", date: today, userId: peer.id },
  ];
  for (const row of homeRows) {
    await prisma.followUp.create({
      data: {
        id: randomUUID(),
        organisationId: fixtures.organisationId,
        clientId: activeClient.id,
        title: row.title,
        dueDate: parseCalendarDate(row.date)!,
        createdByUserId: administrator.id,
        responsibleUserId: row.userId,
      },
    });
  }

  await logIn(page, ownerEmail, "192.0.2.232");
  await expect(page.getByRole("heading", { name: "Att göra" })).toBeVisible();
  await expect(page.getByText("Hem försenad")).toBeVisible();
  await expect(page.getByText("Hem idag")).toBeVisible();
  await expect(page.getByText("Hem kommande")).toBeVisible();
  await expect(page.getByText("Hem annan användare")).toHaveCount(0);
  await expect(
    page.locator(".home-follow-up-group h3").allTextContents(),
  ).resolves.toEqual(["Försenade", "Idag", "Kommande"]);
  await page.getByRole("link", { name: /Hem försenad/ }).click();
  await expect(
    page.getByRole("heading", { name: "Hem försenad" }),
  ).toBeVisible();
  const accessLossGoal = await prisma.goal.create({
    data: {
      id: randomUUID(),
      organisationId: fixtures.organisationId,
      clientId: activeClient.id,
      title: "Mål som inte får överleva förlorad klientåtkomst",
      startDate: parseCalendarDate(today)!,
      createdByUserId: administrator.id,
    },
  });
  await page.goto(`/klienter/${activeClient.id}/mal/${accessLossGoal.id}`);
  await expect(
    page.getByRole("heading", { name: accessLossGoal.title }),
  ).toBeVisible();

  await prisma.assignment.updateMany({
    where: {
      clientId: activeClient.id,
      staffUserId: owner.id,
      endedAt: null,
    },
    data: { endedAt: new Date() },
  });
  await page.goto("/");
  await expect(page.getByText("Hem försenad")).toHaveCount(0);
  const retainedResponsibility = await prisma.followUp.findFirstOrThrow({
    where: { clientId: activeClient.id, title: "Hem försenad" },
  });
  expect(retainedResponsibility.responsibleUserId).toBe(owner.id);
  await page.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${retainedResponsibility.id}`,
  );
  await expect(
    page.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await page.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${retainedResponsibility.id}/ansvarig`,
  );
  await expect(
    page.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await page.goto(`/klienter/${activeClient.id}/mal/${accessLossGoal.id}`);
  await expect(
    page.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();

  const administratorContext = await browser.newContext();
  const administratorPage = await newSignedInPage(
    administratorContext,
    administratorEmail,
    "192.0.2.233",
  );
  await administratorPage.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${retainedResponsibility.id}`,
  );
  await expect(
    administratorPage.getByText("Ansvar behöver uppdateras."),
  ).toBeVisible();
  await expect(
    administratorPage.getByText(/inte tilldelats någon annan automatiskt/),
  ).toBeVisible();

  await administratorPage.goto(`/klienter/${fixtures.archivedClient.id}/mal`);
  await expect(
    administratorPage.getByText("Målen visas skrivskyddat"),
  ).toBeVisible();
  await expect(
    administratorPage.getByRole("link", { name: "Nytt mål" }),
  ).toHaveCount(0);
  await administratorPage.goto(
    `/klienter/${fixtures.archivedClient.id}/uppfoljningar/${fixtures.archivedFollowUp.id}`,
  );
  await expect(
    administratorPage.getByText("Uppföljningen visas skrivskyddat"),
  ).toBeVisible();
  await expect(
    administratorPage.getByRole("link", { name: /Redigera/ }),
  ).toHaveCount(0);

  const unrelatedContext = await browser.newContext();
  const unrelatedPage = await newSignedInPage(
    unrelatedContext,
    unrelatedEmail,
    "192.0.2.234",
  );
  await unrelatedPage.goto(`/klienter/${fixtures.archivedClient.id}/mal`);
  await expect(
    unrelatedPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await unrelatedPage.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${retainedResponsibility.id}`,
  );
  await expect(
    unrelatedPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await unrelatedPage.goto(
    `/klienter/${activeClient.id}/uppfoljningar/${retainedResponsibility.id}/ansvarig`,
  );
  await expect(
    unrelatedPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await administratorContext.close();
  await unrelatedContext.close();
});

test("Journal Goal snapshots remain optional, immutable, keyboard usable, and mobile functional", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { activeClient, peer } = fixtures;
  const longGoalTitle =
    "Ett mycket långt fiktivt mål som ska radbrytas tydligt vid förstoring och på en smal mobilskärm utan att viktig information döljs";
  const renamedLongGoalTitle =
    "En senare ändrad och fortfarande mycket lång fiktiv måltitel som ska radbrytas tydligt på en smal mobilskärm";
  const goals = await Promise.all(
    [longGoalTitle, "Fiktivt mål för social planering"].map((title) =>
      prisma.goal.create({
        data: {
          id: randomUUID(),
          organisationId: fixtures.organisationId,
          clientId: activeClient.id,
          title,
          startDate: parseCalendarDate(
            formatStockholmCalendarDate(new Date()),
          )!,
          createdByUserId: peer.id,
        },
      }),
    ),
  );

  await logIn(page, peerEmail, "192.0.2.235");
  await page.goto(`/klienter/${activeClient.id}/anteckningar/utkast`);
  await page
    .getByRole("textbox", { name: "Övrigt", exact: true })
    .fill("Fiktiv anteckning utan mål.");
  await page.getByRole("button", { name: "Granska inför signering" }).click();
  await expect(page.getByText("Inga mål är valda.")).toBeVisible();
  await page.getByRole("button", { name: "Signera anteckning" }).click();
  await expect(page.getByText("Anteckningen har signerats.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mål vid signering" }),
  ).toHaveCount(0);

  await page.goto(`/klienter/${activeClient.id}/anteckningar/utkast`);
  await page
    .getByRole("textbox", { name: "Övrigt", exact: true })
    .fill("Fiktiv anteckning med två mål.");
  await page.getByRole("checkbox", { name: new RegExp(longGoalTitle) }).check();
  await page
    .getByRole("checkbox", { name: /Fiktivt mål för social planering/ })
    .check();
  await page.getByRole("button", { name: "Granska inför signering" }).click();
  await expect(page.getByRole("heading", { name: "Valda mål" })).toBeVisible();
  await expect(page.getByText(longGoalTitle)).toBeVisible();
  await expect(
    page.getByText("Fiktivt mål för social planering"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Signera anteckning" }).click();
  await expect(
    page.getByRole("heading", { name: "Mål vid signering" }),
  ).toBeVisible();
  const signedUrl = page.url();
  await page.goto(`/klienter/${activeClient.id}/mal/${goals[0].id}/redigera`);
  await page.getByLabel("Rubrik").fill(renamedLongGoalTitle);
  await page.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(page.getByText("Målet har sparats.")).toBeVisible();
  await page.goto(`/klienter/${activeClient.id}/mal/${goals[1].id}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Arkivera", exact: true }).click();
  await expect(page.getByText("Arkiverat", { exact: true })).toBeVisible();
  await page.goto(signedUrl);
  await expect(page.getByText(longGoalTitle)).toBeVisible();
  await expect(page.getByText(renamedLongGoalTitle)).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect(page.url()).toBe(signedUrl);

  await page.getByRole("button", { name: "Skapa rättelse" }).click();
  await expect(
    page.getByRole("heading", { name: /Rättelse av anteckning/ }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Kasta utkast" }).click();
  await expect(page.getByText("Utkastet har kastats.")).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/klienter/${activeClient.id}`);
  const goalsLink = page.getByRole("link", { name: "Mål", exact: true });
  await tabTo(page, goalsLink);
  await expect(goalsLink).toBeFocused();
  await expect(
    goalsLink.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).resolves.not.toBe("none");
  await goalsLink.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Mål", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(renamedLongGoalTitle)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.goto(`/klienter/${activeClient.id}/uppfoljningar/ny`);
  await expect(page.getByLabel("Rubrik")).toBeVisible();
  await expect(page.getByLabel("Datum för uppföljning")).toBeVisible();
  await expect(page.getByLabel("Ansvarig medarbetare")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
