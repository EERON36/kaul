import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type BrowserContext,
  type Dialog,
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
import { createAuthentication } from "../src/modules/authentication/auth";
import { getTestEnvironment } from "../src/test/test-environment";

const testEnvironment = getTestEnvironment();
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: testEnvironment.integrationDatabaseUrl,
  }),
});
const fixtureAuthentication = createAuthentication(prisma);
const organisationPrefix = "Fiktiv journal UI-organisation ";
const administratorEmail = "journal.ui.administrator@example.test";
const authorEmail = "journal.ui.author@example.test";
const peerEmail = "journal.ui.peer@example.test";
const password = "Fictional Journal UI password 2032";
const rateLimitKeys = new Set<string>();

type Fixtures = Awaited<ReturnType<typeof createFixtures>>;
let fixtures: Fixtures;

async function cleanupOrganisations(organisationIds: readonly string[]) {
  if (organisationIds.length === 0) return;
  await prisma.$transaction(async (transaction) => {
    const protectedTables = ["journalGoalReference", "journalEntry", "goal"];
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
    await transaction.client.deleteMany({
      where: { organisationId: { in: [...organisationIds] } },
    });
    await transaction.session.deleteMany({
      where: { user: { organisationId: { in: [...organisationIds] } } },
    });
    await transaction.account.deleteMany({
      where: { user: { organisationId: { in: [...organisationIds] } } },
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
  const [administrator, author, peer] = await Promise.all([
    createUser(
      organisationId,
      "Fiktiv Journaladministratör",
      administratorEmail,
      UserRole.ADMINISTRATOR,
    ),
    createUser(
      organisationId,
      "Fiktiv Journalförfattare",
      authorEmail,
      UserRole.STAFF_MEMBER,
    ),
    createUser(
      organisationId,
      "Fiktiv Journalkollega",
      peerEmail,
      UserRole.STAFF_MEMBER,
    ),
  ]);
  const clients = await Promise.all(
    [
      "ARBETE",
      "PRIVAT",
      "KONFLIKT",
      "SKAPARACE",
      "TANGENTBORD",
      "NAVIGERING",
      "HISTORIK",
      "MOBILNAVIGERING",
      "SPARFORSENING",
    ].map((label) =>
      prisma.client.create({
        data: {
          id: randomUUID(),
          organisationId,
          firstName: "Fiktiv",
          lastName: `${label.toLocaleLowerCase("sv-SE")}klient`,
          personIdentifier: `JOURNAL-UI-${label}-LÅNG-REFERENS-012345678901234567890123`,
          category: "ADULT",
          status: ClientStatus.ACTIVE,
        },
      }),
    ),
  );
  for (const client of clients) {
    await prisma.assignment.createMany({
      data: [
        {
          id: randomUUID(),
          organisationId,
          clientId: client.id,
          staffUserId: peer.id,
          responsibility: AssignmentResponsibility.PRIMARY,
          createdByUserId: administrator.id,
        },
        {
          id: randomUUID(),
          organisationId,
          clientId: client.id,
          staffUserId: author.id,
          responsibility: AssignmentResponsibility.SECONDARY,
          createdByUserId: administrator.id,
        },
      ],
    });
  }
  const pendingSaveGoal = await prisma.goal.create({
    data: {
      id: randomUUID(),
      organisationId,
      clientId: clients[8].id,
      title: "Fiktivt mål för sparförsening",
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      createdByUserId: author.id,
    },
  });
  return {
    organisationId,
    administrator,
    author,
    peer,
    clients,
    pendingSaveGoal,
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

async function tabTo(page: Page, target: Locator, maximumTabs = 30) {
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

async function openNewDraft(page: Page, clientId: string) {
  await page.goto(`/klienter/${clientId}/anteckningar`);
  await page.getByRole("link", { name: "Ny anteckning" }).click();
  await expect(
    page.getByRole("heading", { name: "Ny anteckning" }),
  ).toBeVisible();
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
  await cleanupOrganisations([fixtures.organisationId]);
  if (rateLimitKeys.size > 0) {
    await prisma.rateLimit.deleteMany({
      where: { key: { in: [...rateLimitKeys] } },
    });
  }
  await prisma.$disconnect();
});

test("Staff completes draft, signing, history, detail, and flat correction", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const client = fixtures.clients[0];
  const originalContent =
    "Första stycket i den fiktiva anteckningen.\n\nAndra stycket bevaras exakt.";
  const correctionContent =
    "Rättelse: den fiktiva uppgiften förtydligas.\n\nOriginalet ska vara oförändrat.";

  await logIn(page, authorEmail, "192.0.2.221");
  await page.goto(`/klienter/${client.id}`);
  await expect(
    page.getByRole("navigation", { name: "Klientarbetsyta" }),
  ).toBeVisible();
  const overviewJournalAction = page.getByRole("link", {
    name: "Ny anteckning",
  });
  await expect(overviewJournalAction).toBeVisible();
  await overviewJournalAction.click();
  await expect(page.getByLabel("Typ av anteckning")).toBeVisible();

  const typeOptions = await page
    .getByLabel("Typ av anteckning")
    .locator("option")
    .allTextContents();
  expect(typeOptions).toEqual([
    "Daganteckning",
    "Samtal",
    "Telefonsamtal",
    "Möte",
    "Hembesök",
    "Skolkontakt",
    "Observation",
    "Övrigt",
  ]);
  await page.getByLabel("Typ av anteckning").selectOption("PHONE_CALL");
  await page.getByLabel("Datum för händelsen").fill("2026-08-12");
  await page.getByLabel("Tid för händelsen").fill("08:15");
  await page.getByLabel("Anteckning", { exact: true }).fill(originalContent);
  await page.getByRole("button", { name: "Spara utkast" }).click();
  await expect(page.getByText("Utkastet har sparats.")).toBeVisible();

  await page.goto(`/klienter/${client.id}`);
  await page.getByRole("link", { name: "Ny anteckning" }).click();
  await expect(page.getByLabel("Typ av anteckning")).toHaveValue("PHONE_CALL");
  await expect(page.getByLabel("Datum för händelsen")).toHaveValue(
    "2026-08-12",
  );
  await expect(page.getByLabel("Tid för händelsen")).toHaveValue("08:15");
  await expect(page.getByLabel("Anteckning", { exact: true })).toHaveValue(
    originalContent,
  );
  await page.getByRole("button", { name: "Granska inför signering" }).click();

  await expect(page.getByRole("heading", { name: "Anteckning" })).toBeVisible();
  await expect(page.getByText("Telefonsamtal", { exact: true })).toBeVisible();
  await expect(page.getByText(originalContent)).toBeVisible();
  await expect(
    page.getByText(
      "När du signerar kan anteckningen inte längre ändras. Fel rättas genom en separat rättelse.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Signera anteckning" }).click();
  await expect(page.getByText("Anteckningen har signerats.")).toBeVisible();
  const originalUrl = page.url();
  const original = await prisma.journalEntry.findFirstOrThrow({
    where: { clientId: client.id, correctionOfId: null, status: "SIGNED" },
  });
  expect(original.eventOccurredAt.toISOString()).toBe(
    "2026-08-12T06:15:00.000Z",
  );

  await expect(page.getByText(originalContent)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Redigera|Ta bort|Spara/ }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Anteckningar" }).click();
  const historyItem = page.locator(".journal-history-link", {
    hasText: original.reference,
  });
  await expect(
    historyItem.getByText("Signerad", { exact: true }),
  ).toBeVisible();
  await expect(historyItem.getByText("Fiktiv Journalförfattare")).toBeVisible();
  await expect(page.getByText(originalContent)).toHaveCount(0);
  await historyItem.click();

  await page.getByRole("button", { name: "Skapa rättelse" }).click();
  await expect(
    page.getByRole("heading", {
      name: `Rättelse av anteckning ${original.reference}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Originalet är signerat och kan inte ändras."),
  ).toBeVisible();
  await page.getByLabel("Typ av anteckning").selectOption("OTHER");
  await page.getByLabel("Datum för händelsen").fill("2026-08-13");
  await page.getByLabel("Tid för händelsen").fill("10:45");
  await page.getByLabel("Anteckning", { exact: true }).fill(correctionContent);
  await page.getByRole("button", { name: "Spara utkast" }).click();
  await expect(page.getByText("Utkastet har sparats.")).toBeVisible();
  await page.getByRole("button", { name: "Granska inför signering" }).click();
  await expect(page.getByText(correctionContent)).toBeVisible();
  await expect(
    page.getByText(`Rättelse av anteckning ${original.reference}`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Signera anteckning" }).click();
  await expect(page.getByText("Anteckningen har signerats.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skapa rättelse" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: original.reference }),
  ).toBeVisible();

  await page.goto(originalUrl);
  await expect(page.getByText(originalContent)).toBeVisible();
  await expect(page.getByText(correctionContent)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Rättelser" })).toBeVisible();
  await expect(page.locator(".journal-corrections a")).toHaveCount(1);

  await page.getByRole("link", { name: "Anteckningar" }).click();
  await page.getByRole("link", { name: "Ny anteckning" }).click();
  await page.getByLabel("Datum för händelsen").fill("2026-08-13");
  await page.getByLabel("Tid för händelsen").fill("12:00");
  await page
    .getByLabel("Anteckning", { exact: true })
    .fill("Ett separat fiktivt utkast som ska kastas.");
  await page.getByRole("button", { name: "Spara utkast" }).click();
  await expect(page.getByText("Utkastet har sparats.")).toBeVisible();
  await page.goto(originalUrl);
  await page.getByRole("button", { name: "Skapa rättelse" }).click();
  await expect(
    page.getByText("Du har redan ett öppet utkast för den här klienten."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Öppna utkast" }).click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Vill du kasta utkastet?");
    return dialog.accept();
  });
  await page.getByRole("button", { name: "Kasta utkast" }).click();
  await expect(page.getByText("Utkastet har kastats.")).toBeVisible();
});

test("Unsaved Journal work protects internal navigation without trapping a saved form", async ({
  page,
}) => {
  const client = fixtures.clients[5];
  const content = page.getByLabel("Anteckning", { exact: true });
  const warning =
    "Du har osparade ändringar i anteckningen. Vill du lämna sidan? Ändringarna försvinner om du inte sparar dem.";

  await logIn(page, authorEmail, "192.0.2.229");
  await openNewDraft(page, client.id);

  const unexpectedDialogs: string[] = [];
  const collectUnexpectedDialog = async (dialog: Dialog) => {
    unexpectedDialogs.push(dialog.message());
    await dialog.accept();
  };
  page.on("dialog", collectUnexpectedDialog);
  await content.fill("Tillfällig ändring som återställs.");
  await content.fill("");
  await page.getByRole("link", { name: "Översikt", exact: true }).click();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter/${client.id}`,
  );
  expect(unexpectedDialogs).toEqual([]);
  page.off("dialog", collectUnexpectedDialog);

  await openNewDraft(page, client.id);
  const unsavedContent =
    "Betydande fiktiv anteckning som inte får försvinna utan varning.";
  await content.fill(unsavedContent);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe(warning);
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Mål", exact: true }).click();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter/${client.id}/anteckningar/utkast`,
  );
  await expect(content).toHaveValue(unsavedContent);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe(warning);
    await dialog.accept();
  });
  await page.getByRole("link", { name: "Hem", exact: true }).click();
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);

  await openNewDraft(page, client.id);
  await content.fill("Fiktiv anteckning som sparas före navigering.");
  await page.getByRole("button", { name: "Spara utkast" }).click();
  await expect(page.getByText("Utkastet har sparats.")).toBeVisible();

  const postSaveDialogs: string[] = [];
  const collectPostSaveDialog = async (dialog: Dialog) => {
    postSaveDialogs.push(dialog.message());
    await dialog.accept();
  };
  page.on("dialog", collectPostSaveDialog);
  await page.getByRole("link", { name: "Uppföljningar", exact: true }).click();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter/${client.id}/uppfoljningar`,
  );
  expect(postSaveDialogs).toEqual([]);
  page.off("dialog", collectPostSaveDialog);
});

test("A delayed Journal save blocks newer edits until its response establishes a clean baseline", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const client = fixtures.clients[8];
  const contentA = "Fiktivt innehåll A som ska sparas.";
  const contentB = "Fiktivt innehåll B som skrivs efter sparningen.";

  await logIn(page, authorEmail, "192.0.2.232");
  await openNewDraft(page, client.id);

  const editorForm = page.locator("form").filter({
    has: page.getByLabel("Typ av anteckning"),
  });
  const entryType = page.getByLabel("Typ av anteckning");
  const eventDate = page.getByLabel("Datum för händelsen");
  const eventTime = page.getByLabel("Tid för händelsen");
  const content = page.getByLabel("Anteckning", { exact: true });
  const goal = page.getByRole("checkbox", {
    name: new RegExp(fixtures.pendingSaveGoal.title),
  });
  const save = editorForm.locator('button[name="submitIntent"][value="save"]');
  const review = editorForm.locator(
    'button[name="submitIntent"][value="review"]',
  );
  const discard = page.getByRole("button", { name: "Kasta utkast" });

  await entryType.selectOption("CONVERSATION");
  await eventDate.fill("2026-08-20");
  await eventTime.fill("22:01");
  await content.fill(contentA);
  await goal.check();

  let releaseSaveResponse: (() => void) | undefined;
  const saveResponseGate = new Promise<void>((resolve) => {
    releaseSaveResponse = resolve;
  });
  let heldSaveResponses = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      request.headers()["next-action"] === undefined
    ) {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    heldSaveResponses += 1;
    await saveResponseGate;
    await route.fulfill({ response });
  });

  try {
    await save.click();
    await expect.poll(() => heldSaveResponses).toBe(1);

    await expect(editorForm).toHaveAttribute("aria-busy", "true");
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Utkastet sparas. Vänta tills det är klart innan du fortsätter redigera.",
      }),
    ).toBeVisible();
    await expect(entryType).toBeDisabled();
    await expect(eventDate).toBeDisabled();
    await expect(eventTime).toBeDisabled();
    await expect(content).toBeDisabled();
    await expect(goal).toBeDisabled();
    await expect(save).toBeDisabled();
    await expect(review).toBeDisabled();
    await expect(discard).toBeDisabled();

    let contentEditWasBlocked = false;
    try {
      await content.fill(contentB, { timeout: 500 });
    } catch {
      contentEditWasBlocked = true;
    }
    expect(contentEditWasBlocked).toBe(true);

    let goalEditWasBlocked = false;
    try {
      await goal.uncheck({ timeout: 500 });
    } catch {
      goalEditWasBlocked = true;
    }
    expect(goalEditWasBlocked).toBe(true);
    await expect(content).toHaveValue(contentA);
    await expect(goal).toBeChecked();
  } finally {
    releaseSaveResponse?.();
  }

  await expect(page.getByText("Utkastet har sparats.")).toBeVisible();
  await page.unroute("**/*");
  await expect(editorForm).toHaveAttribute("aria-busy", "false");
  await expect(entryType).toBeEnabled();
  await expect(eventDate).toBeEnabled();
  await expect(eventTime).toBeEnabled();
  await expect(content).toBeEnabled();
  await expect(goal).toBeEnabled();
  await expect(save).toBeEnabled();
  await expect(review).toBeEnabled();
  await expect(discard).toBeEnabled();

  const postSaveDialogs: string[] = [];
  const collectPostSaveDialog = async (dialog: Dialog) => {
    postSaveDialogs.push(dialog.message());
    await dialog.accept();
  };
  page.on("dialog", collectPostSaveDialog);
  await page.getByRole("link", { name: "Mål", exact: true }).click();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter/${client.id}/mal`,
  );
  expect(postSaveDialogs).toEqual([]);
  page.off("dialog", collectPostSaveDialog);

  await page.goto(`/klienter/${client.id}/anteckningar`);
  await page.getByRole("link", { name: "Öppna utkast" }).click();
  await expect(
    page.getByRole("heading", { name: "Ny anteckning" }),
  ).toBeVisible();
  await expect(content).toHaveValue(contentA);
  await expect(goal).toBeChecked();
  await content.fill(contentB);
  await expect(content).toHaveValue(contentB);
  await save.click();
  await expect(page.getByText("Utkastet har sparats.")).toBeVisible();
});

test("Browser Back and Forward protect unsaved Journal work without trapping clean history", async ({
  page,
}) => {
  const client = fixtures.clients[6];
  const content = page.getByLabel("Anteckning", { exact: true });
  const editorUrl = `${testEnvironment.origin}/klienter/${client.id}/anteckningar/utkast`;
  const journalUrl = `${testEnvironment.origin}/klienter/${client.id}/anteckningar`;
  const overviewUrl = `${testEnvironment.origin}/klienter/${client.id}`;
  const warning =
    "Du har osparade ändringar i anteckningen. Vill du lämna sidan? Ändringarna försvinner om du inte sparar dem.";

  await logIn(page, authorEmail, "192.0.2.230");
  await page.goto(`/klienter/${client.id}`);
  await page.getByRole("link", { name: "Anteckningar" }).click();
  await expect(page).toHaveURL(journalUrl);
  await page.getByRole("link", { name: "Ny anteckning" }).click();
  await expect(page).toHaveURL(editorUrl);

  const cleanDialogs: string[] = [];
  const collectCleanDialog = async (dialog: Dialog) => {
    cleanDialogs.push(dialog.message());
    await dialog.accept();
  };
  page.on("dialog", collectCleanDialog);
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(journalUrl);
  await page.evaluate(() => window.history.forward());
  await expect(page).toHaveURL(editorUrl);
  expect(cleanDialogs).toEqual([]);
  page.off("dialog", collectCleanDialog);

  const backContent =
    "Fiktiv osparad anteckning som skyddas vid webbläsarens Bakåt.";
  let backWarningCount = 0;
  const handleBackWarning = async (dialog: Dialog) => {
    backWarningCount += 1;
    expect(dialog.message()).toBe(warning);
    if (backWarningCount === 1) await dialog.dismiss();
    else await dialog.accept();
  };
  page.on("dialog", handleBackWarning);
  await content.evaluate((element, value) => {
    if (!(element instanceof HTMLTextAreaElement)) {
      throw new Error("Expected the Journal content textarea.");
    }
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (!setValue) throw new Error("Textarea value setter is unavailable.");
    setValue.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    window.history.back();
  }, backContent);
  await expect(page).toHaveURL(editorUrl);
  await expect(content).toHaveValue(backContent);
  expect(backWarningCount).toBe(1);

  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(journalUrl);
  expect(backWarningCount).toBe(2);
  page.off("dialog", handleBackWarning);

  const forwardDialogs: string[] = [];
  const collectForwardDialog = async (dialog: Dialog) => {
    forwardDialogs.push(dialog.message());
    await dialog.accept();
  };
  page.on("dialog", collectForwardDialog);
  await page.evaluate(() => window.history.forward());
  await expect(page).toHaveURL(editorUrl);
  expect(forwardDialogs).toEqual([]);
  page.off("dialog", collectForwardDialog);

  await content.fill("");
  await page.getByRole("link", { name: "Översikt", exact: true }).click();
  await expect(page).toHaveURL(overviewUrl);
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(editorUrl);

  const forwardContent =
    "Fiktiv osparad anteckning som skyddas vid webbläsarens Framåt.";
  let guardedForwardWarningCount = 0;
  const handleGuardedForwardWarning = async (dialog: Dialog) => {
    guardedForwardWarningCount += 1;
    expect(dialog.message()).toBe(warning);
    if (guardedForwardWarningCount === 1) await dialog.dismiss();
    else await dialog.accept();
  };
  page.on("dialog", handleGuardedForwardWarning);
  await content.evaluate((element, value) => {
    if (!(element instanceof HTMLTextAreaElement)) {
      throw new Error("Expected the Journal content textarea.");
    }
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (!setValue) throw new Error("Textarea value setter is unavailable.");
    setValue.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    window.history.forward();
  }, forwardContent);
  await expect(page).toHaveURL(editorUrl);
  await expect(content).toHaveValue(forwardContent);
  expect(guardedForwardWarningCount).toBe(1);

  await page.evaluate(() => window.history.forward());
  await expect(page).toHaveURL(overviewUrl);
  expect(guardedForwardWarningCount).toBe(2);
  page.off("dialog", handleGuardedForwardWarning);
});

test("Cancelled mobile Journal navigation keeps visible focus and confirmed navigation closes the menu", async ({
  page,
}) => {
  const client = fixtures.clients[7];
  const unsavedContent =
    "Fiktiv osparad mobilanteckning som ska finnas kvar efter Avbryt.";
  const warning =
    "Du har osparade ändringar i anteckningen. Vill du lämna sidan? Ändringarna försvinner om du inte sparar dem.";

  await logIn(page, authorEmail, "192.0.2.231");
  await page.setViewportSize({ width: 375, height: 812 });
  await openNewDraft(page, client.id);
  const content = page.getByLabel("Anteckning", { exact: true });
  await content.fill(unsavedContent);

  const menuButton = page.locator(".mobile-menu-button");
  const homeLink = page.getByRole("link", { name: "Hem", exact: true });
  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await homeLink.focus();

  let warningCount = 0;
  const handleWarning = async (dialog: Dialog) => {
    warningCount += 1;
    expect(dialog.message()).toBe(warning);
    if (warningCount === 1) await dialog.dismiss();
    else await dialog.accept();
  };
  page.on("dialog", handleWarning);
  await homeLink.press("Enter");
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter/${client.id}/anteckningar/utkast`,
  );
  await expect(content).toHaveValue(unsavedContent);
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(homeLink).toBeVisible();
  await expect(homeLink).toBeFocused();
  expect(warningCount).toBe(1);

  await homeLink.press("Enter");
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);
  await expect(page.locator(".mobile-menu-button")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(warningCount).toBe(2);
  page.off("dialog", handleWarning);
});

test("Draft privacy, signed access, access loss, archive, and mobile reflow stay safe", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  const client = fixtures.clients[1];
  const privateContent = "Endast författarens privata fiktiva utkast.";

  await logIn(page, authorEmail, "192.0.2.222");
  await openNewDraft(page, client.id);
  await page.getByLabel("Typ av anteckning").selectOption("MEETING");
  await page.getByLabel("Datum för händelsen").fill("2026-08-11");
  await page.getByLabel("Tid för händelsen").fill("14:30");
  await page.getByLabel("Anteckning", { exact: true }).fill(privateContent);
  await page.getByRole("button", { name: "Spara utkast" }).click();
  await expect(page.getByText("Utkastet har sparats.")).toBeVisible();

  const administratorContext = await browser.newContext();
  const administratorPage = await newSignedInPage(
    administratorContext,
    administratorEmail,
    "192.0.2.223",
  );
  await administratorPage.goto(`/klienter/${client.id}/anteckningar`);
  await expect(administratorPage.getByText(privateContent)).toHaveCount(0);
  await expect(
    administratorPage.getByText("1 öppet utkast", { exact: true }),
  ).toHaveCount(0);
  await expect(
    administratorPage.getByText("1 utkast", { exact: true }),
  ).toHaveCount(0);
  await expect(
    administratorPage.getByRole("link", { name: "Ny anteckning" }),
  ).toBeVisible();
  await administratorPage.goto(`/klienter/${client.id}/anteckningar/utkast`);
  await expect(
    administratorPage.getByLabel("Anteckning", { exact: true }),
  ).toHaveValue("");

  const peerContext = await browser.newContext();
  const peerPage = await newSignedInPage(peerContext, peerEmail, "192.0.2.224");
  await peerPage.goto(`/klienter/${client.id}/anteckningar`);
  await expect(peerPage.getByText(privateContent)).toHaveCount(0);
  await expect(
    peerPage.getByText("1 öppet utkast", { exact: true }),
  ).toHaveCount(0);
  await expect(peerPage.getByText("1 utkast", { exact: true })).toHaveCount(0);
  await peerPage.goto(`/klienter/${client.id}/anteckningar/utkast`);
  await expect(peerPage.getByLabel("Anteckning", { exact: true })).toHaveValue(
    "",
  );

  const draft = await prisma.journalEntry.findFirstOrThrow({
    where: {
      clientId: client.id,
      authorUserId: fixtures.author.id,
      status: "DRAFT",
    },
  });
  await prisma.assignment.updateMany({
    where: {
      clientId: client.id,
      staffUserId: fixtures.author.id,
      endedAt: null,
    },
    data: { endedAt: new Date() },
  });
  await page
    .getByLabel("Anteckning", { exact: true })
    .fill(`${privateContent} Ändrad.`);
  await page.getByRole("button", { name: "Spara utkast" }).click();
  await expect(
    page.getByText(
      "Du har inte längre behörighet till klienten. Ändringarna har inte sparats.",
    ),
  ).toBeVisible();
  await expect(
    prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } }),
  ).resolves.toMatchObject({ content: privateContent, version: draft.version });

  const signedClient = fixtures.clients[0];
  const signedOriginal = await prisma.journalEntry.findFirstOrThrow({
    where: {
      clientId: signedClient.id,
      correctionOfId: null,
      status: "SIGNED",
    },
  });
  await administratorPage.goto(
    `/klienter/${signedClient.id}/anteckningar/${signedOriginal.id}`,
  );
  await expect(
    administratorPage.getByText(signedOriginal.content),
  ).toBeVisible();
  await peerPage.goto(
    `/klienter/${signedClient.id}/anteckningar/${signedOriginal.id}`,
  );
  await expect(peerPage.getByText(signedOriginal.content)).toBeVisible();
  await prisma.assignment.updateMany({
    where: {
      clientId: signedClient.id,
      staffUserId: fixtures.peer.id,
      endedAt: null,
    },
    data: { endedAt: new Date() },
  });
  await prisma.client.update({
    where: { id: signedClient.id },
    data: { status: ClientStatus.INACTIVE },
  });
  await peerPage.goto(
    `/klienter/${signedClient.id}/anteckningar/${signedOriginal.id}`,
  );
  await expect(
    peerPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();

  await prisma.assignment.updateMany({
    where: { clientId: signedClient.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  await prisma.client.update({
    where: { id: signedClient.id },
    data: { status: ClientStatus.ARCHIVED, archivedAt: new Date() },
  });
  await administratorPage.goto(`/klienter/${signedClient.id}/anteckningar`);
  await expect(
    administratorPage.getByText(
      "Klienten är arkiverad. Anteckningar visas skrivskyddat.",
    ),
  ).toBeVisible();
  await expect(
    administratorPage.getByRole("link", { name: "Ny anteckning" }),
  ).toHaveCount(0);
  await expect(
    administratorPage.getByRole("link", { name: "Öppna utkast" }),
  ).toHaveCount(0);
  await administratorPage.goto(`/klienter/${signedClient.id}`);
  await expect(
    administratorPage.getByRole("link", { name: "Ny anteckning" }),
  ).toHaveCount(0);
  await administratorPage.goto(
    `/klienter/${signedClient.id}/anteckningar/${signedOriginal.id}`,
  );
  await expect(
    administratorPage.getByRole("button", { name: "Skapa rättelse" }),
  ).toHaveCount(0);

  await administratorPage.setViewportSize({ width: 375, height: 812 });
  await expectNoHorizontalOverflow(administratorPage);
  await administratorPage.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalOverflow(administratorPage);

  await administratorContext.close();
  await peerContext.close();
});

test("Stale save and repeated signing show safe conflicts without overwriting", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const client = fixtures.clients[2];
  await logIn(page, authorEmail, "192.0.2.225");
  await page.setViewportSize({ width: 375, height: 812 });
  await openNewDraft(page, client.id);
  await page.getByLabel("Typ av anteckning").selectOption("OBSERVATION");
  await page.getByLabel("Datum för händelsen").fill("2026-08-10");
  await page.getByLabel("Tid för händelsen").fill("09:10");
  await page
    .getByLabel("Anteckning", { exact: true })
    .fill("Första sparade versionen.");
  await page.getByRole("button", { name: "Spara utkast" }).click();
  await expect(page.getByText("Utkastet har sparats.")).toBeVisible();

  const draft = await prisma.journalEntry.findFirstOrThrow({
    where: {
      clientId: client.id,
      authorUserId: fixtures.author.id,
      status: "DRAFT",
    },
  });
  await prisma.journalEntry.update({
    where: { id: draft.id },
    data: { content: "Nyare sparat innehåll.", version: { increment: 1 } },
  });
  await page
    .getByLabel("Anteckning", { exact: true })
    .fill("Webbläsarens osparade innehåll.");
  await page.getByRole("button", { name: "Spara utkast" }).click();
  await expect(
    page.getByText(
      "Utkastet har ändrats i en annan session. Dina ändringar har inte sparats. Ladda om utkastet och granska det sparade innehållet.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Anteckning", { exact: true })).toHaveValue(
    "Webbläsarens osparade innehåll.",
  );
  await expect(
    prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } }),
  ).resolves.toMatchObject({ content: "Nyare sparat innehåll." });
  await page.getByRole("link", { name: "Ladda om utkastet" }).click();
  await expect(page.getByLabel("Anteckning", { exact: true })).toHaveValue(
    "Nyare sparat innehåll.",
  );
  await page.getByRole("button", { name: "Granska inför signering" }).click();
  await expectNoHorizontalOverflow(page);

  let signingRequest:
    { url: string; body: string; headers: Record<string, string> } | undefined;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined &&
      request.postData()
    ) {
      signingRequest = {
        url: request.url(),
        body: request.postData() ?? "",
        headers: Object.fromEntries(
          [
            "accept",
            "content-type",
            "next-action",
            "next-router-state-tree",
            "rsc",
          ]
            .map((name) => [name, request.headers()[name]] as const)
            .filter(
              (entry): entry is readonly [string, string] =>
                entry[1] !== undefined,
            ),
        ),
      };
    }
  });
  await page.getByRole("button", { name: "Signera anteckning" }).click();
  await expect(page.getByText("Anteckningen har signerats.")).toBeVisible();
  expect(signingRequest).toBeDefined();
  const repeatedResponse = await page.evaluate(async (request) => {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      credentials: "same-origin",
    });
    return { ok: response.ok, text: await response.text() };
  }, signingRequest!);
  expect(repeatedResponse.ok).toBe(true);
  expect(repeatedResponse.text).toContain(
    "Anteckningen kunde inte signeras eftersom den har ändrats eller redan signerats.",
  );
  await expect(
    prisma.journalEntry.count({
      where: { clientId: client.id, status: "SIGNED" },
    }),
  ).resolves.toBe(1);
  await expectNoHorizontalOverflow(page);
});

test("Same-actor initial-create race requires reload before newer content can change", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const client = fixtures.clients[3];
  const durableContent = "Innehåll från den första fiktiva sessionen.";
  const staleContent = "Osparat innehåll från den andra fiktiva sessionen.";
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();

  try {
    const firstPage = await newSignedInPage(
      firstContext,
      authorEmail,
      "192.0.2.226",
    );
    const secondPage = await newSignedInPage(
      secondContext,
      authorEmail,
      "192.0.2.227",
    );
    await Promise.all([
      openNewDraft(firstPage, client.id),
      openNewDraft(secondPage, client.id),
    ]);

    await firstPage.getByLabel("Datum för händelsen").fill("2026-08-14");
    await firstPage.getByLabel("Tid för händelsen").fill("08:30");
    await firstPage
      .getByLabel("Anteckning", { exact: true })
      .fill(durableContent);
    await secondPage.getByLabel("Datum för händelsen").fill("2026-08-14");
    await secondPage.getByLabel("Tid för händelsen").fill("09:30");
    await secondPage
      .getByLabel("Anteckning", { exact: true })
      .fill(staleContent);

    await firstPage.getByRole("button", { name: "Spara utkast" }).click();
    await expect(firstPage.getByText("Utkastet har sparats.")).toBeVisible();
    const durableDraft = await prisma.journalEntry.findFirstOrThrow({
      where: {
        clientId: client.id,
        authorUserId: fixtures.author.id,
        status: "DRAFT",
      },
    });

    await secondPage.getByRole("button", { name: "Spara utkast" }).click();
    await expect(
      secondPage.getByText(
        "Utkastet har ändrats i en annan session. Dina ändringar har inte sparats. Ladda om utkastet och granska det sparade innehållet.",
      ),
    ).toBeVisible();
    await expect(
      secondPage.getByLabel("Anteckning", { exact: true }),
    ).toHaveValue(staleContent);
    const secondEditorForm = secondPage.locator("form").filter({
      has: secondPage.getByLabel("Typ av anteckning"),
    });
    await expect(
      secondEditorForm.locator('input[name="journalEntryId"]'),
    ).toHaveValue("");
    await expect(
      secondEditorForm.locator('input[name="expectedVersion"]'),
    ).toHaveValue("");

    await secondPage
      .getByRole("button", { name: "Granska inför signering" })
      .click();
    await expect(secondPage).toHaveURL(
      `${testEnvironment.origin}/klienter/${client.id}/anteckningar/utkast`,
    );
    await expect(
      prisma.journalEntry.findUniqueOrThrow({
        where: { id: durableDraft.id },
      }),
    ).resolves.toMatchObject({
      content: durableContent,
      version: durableDraft.version,
    });

    await secondPage.getByRole("link", { name: "Ladda om utkastet" }).click();
    await expect(
      secondPage.getByLabel("Anteckning", { exact: true }),
    ).toHaveValue(durableContent);
    await expect(
      secondEditorForm.locator('input[name="journalEntryId"]'),
    ).toHaveValue(durableDraft.id);
    await expect(
      secondEditorForm.locator('input[name="expectedVersion"]'),
    ).toHaveValue(String(durableDraft.version));
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("Keyboard reaches the Journal editor and signing action with visible focus", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const client = fixtures.clients[4];
  await logIn(page, authorEmail, "192.0.2.228");
  await page.goto(`/klienter/${client.id}`);

  const journalNavigation = page.getByRole("link", { name: "Anteckningar" });
  await tabTo(page, journalNavigation);
  await expect(journalNavigation).toBeFocused();
  await page.keyboard.press("Enter");

  const newEntry = page.getByRole("link", { name: "Ny anteckning" });
  await tabTo(page, newEntry);
  await expect(newEntry).toBeFocused();
  await page.keyboard.press("Enter");

  const entryType = page.getByLabel("Typ av anteckning");
  await tabTo(page, entryType);
  await expect(entryType).toBeFocused();
  const focusStyle = await entryType.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);
  await entryType.selectOption("CONVERSATION");

  const eventDate = page.getByLabel("Datum för händelsen");
  await tabTo(page, eventDate, 6);
  await expect(eventDate).toBeFocused();
  await eventDate.fill("2026-08-15");

  const eventTime = page.getByLabel("Tid för händelsen");
  await tabTo(page, eventTime, 6);
  await expect(eventTime).toBeFocused();
  await eventTime.fill("11:20");

  const content = page.getByLabel("Anteckning", { exact: true });
  await tabTo(page, content, 6);
  await expect(content).toBeFocused();
  await content.fill("Fiktiv anteckning för permanent tangentbordstest.");

  const save = page.getByRole("button", { name: "Spara utkast" });
  await tabTo(page, save, 3);
  await expect(save).toBeFocused();

  const review = page.getByRole("button", {
    name: "Granska inför signering",
  });
  await tabTo(page, review, 3);
  await expect(review).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Anteckning" })).toBeVisible();

  const sign = page.getByRole("button", { name: "Signera anteckning" });
  await tabTo(page, sign);
  await expect(sign).toBeFocused();
});
