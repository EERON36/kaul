import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
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
const organisationName = "Fiktiva Klientflödesorganisationen";
const administratorEmail = "client.e2e.administrator@example.test";
const primaryEmail = "client.e2e.primary@example.test";
const secondaryEmail = "client.e2e.secondary@example.test";
const unrelatedEmail = "client.e2e.unrelated@example.test";
const password = "Fictional Client E2E password 2032";
const fixtureEmails = [
  administratorEmail,
  primaryEmail,
  secondaryEmail,
  unrelatedEmail,
];
const rateLimitKeys = new Set<string>();

async function cleanupFixtures(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: fixtureEmails } },
    select: { id: true, organisationId: true },
  });
  const userIds = users.map(({ id }) => id);
  const organisationIds = [
    ...new Set(users.map(({ organisationId }) => organisationId)),
  ];

  if (organisationIds.length > 0) {
    await prisma.assignment.deleteMany({
      where: { organisationId: { in: organisationIds } },
    });
    await prisma.client.deleteMany({
      where: { organisationId: { in: organisationIds } },
    });
  }
  if (userIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (organisationIds.length > 0) {
    await prisma.organisation.deleteMany({
      where: { id: { in: organisationIds } },
    });
  }
  if (rateLimitKeys.size > 0) {
    await prisma.rateLimit.deleteMany({
      where: { key: { in: [...rateLimitKeys] } },
    });
  }
  rateLimitKeys.clear();
}

async function createFixtureUser(
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
}

async function createFixtures(): Promise<void> {
  const organisationId = randomUUID();
  await prisma.organisation.create({
    data: { id: organisationId, name: organisationName },
  });
  await createFixtureUser(
    organisationId,
    "Fiktiv Administratör",
    administratorEmail,
    UserRole.ADMINISTRATOR,
  );
  await createFixtureUser(
    organisationId,
    "Fiktiv Primär",
    primaryEmail,
    UserRole.STAFF_MEMBER,
  );
  await createFixtureUser(
    organisationId,
    "Fiktiv Sekundär",
    secondaryEmail,
    UserRole.STAFF_MEMBER,
  );
  await createFixtureUser(
    organisationId,
    "Fiktiv Orelaterad",
    unrelatedEmail,
    UserRole.STAFF_MEMBER,
  );
}

async function logIn(
  page: Page,
  email: string,
  ipAddress: string,
): Promise<void> {
  rateLimitKeys.add(`${ipAddress}|/sign-in/email`);
  await page.setExtraHTTPHeaders({ "x-real-ip": ipAddress });
  await page.goto("/login");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord").fill(password);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanupFixtures();
  await createFixtures();
});

test.afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

test("Swedish non-disclosing not-found page handles unknown URLs with keyboard navigation", async ({
  page,
}) => {
  await logIn(page, administratorEmail, "192.0.2.180");
  const response = await page.goto("/sida-saknas");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await expect(
    page.getByText("Den kan ha tagits bort eller kan inte visas."),
  ).toBeVisible();
  await expect(page.getByText("This page could not be found")).toHaveCount(0);

  const overviewLink = page.getByRole("link", { name: "Gå till Översikt" });
  await page.keyboard.press("Tab");
  await expect(overviewLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);
  await expect(page.getByRole("heading", { name: "Översikt" })).toBeVisible();
});

test("Administrator gets static keyboard-usable first-session guidance while Staff does not", async ({
  browser,
  page,
}) => {
  await logIn(page, administratorEmail, "192.0.2.240");
  const orientation = page.getByRole("region", { name: "Kom igång" });
  await expect(orientation).toBeVisible();
  await expect(orientation.getByRole("listitem")).toHaveCount(3);
  await expect(
    orientation.getByRole("link", { name: "Lägg till personal" }),
  ).toHaveAttribute("href", "/personal");
  await expect(
    orientation.getByRole("link", { name: "Skapa klient" }),
  ).toHaveAttribute("href", "/klienter");
  await expect(
    orientation.getByRole("link", { name: "Lägg till primär tilldelning" }),
  ).toHaveAttribute("href", "/klienter");
  await expect(orientation.getByRole("progressbar")).toHaveCount(0);
  await expect(orientation.getByRole("checkbox")).toHaveCount(0);
  await expect(orientation.getByRole("button")).toHaveCount(0);

  const personnelLink = orientation.getByRole("link", {
    name: "Lägg till personal",
  });
  await personnelLink.focus();
  await expect(personnelLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${testEnvironment.origin}/personal`);
  await page.goBack();

  const clientLink = page
    .getByRole("region", { name: "Kom igång" })
    .getByRole("link", { name: "Skapa klient" });
  await clientLink.focus();
  await expect(clientLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${testEnvironment.origin}/klienter`);
  await page.goBack();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await expect(page.getByRole("region", { name: "Kom igång" })).toBeVisible();

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await logIn(staffPage, primaryEmail, "192.0.2.241");
  await expect(
    staffPage.getByRole("heading", { name: "Kom igång" }),
  ).toHaveCount(0);
  await staffContext.close();
});

test("Client assignment controls access, revocation, and secondary regain", async ({
  browser,
  page,
}) => {
  await logIn(page, administratorEmail, "192.0.2.181");
  await expect(page.getByRole("button", { name: "Klienter" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Personal", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Klienter" }).click();
  await page.getByRole("link", { name: "Vuxna", exact: true }).click();
  await page.getByLabel("Förnamn").fill("Fiktiv");
  await page.getByLabel("Efternamn").fill("Klientperson");
  await page.getByLabel("Personreferens").fill("   ");
  await page.getByLabel("Kategori", { exact: true }).selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(
    page.getByText("Kontrollera uppgifterna och försök igen."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Öppna klienten och lägg till tilldelning",
    }),
  ).toHaveCount(0);

  await page.getByLabel("Förnamn").fill("Fiktiv");
  await page.getByLabel("Efternamn").fill("Klientperson");
  await page.getByLabel("Personreferens").fill("e2e-klient-01");
  await page.getByLabel("Kategori", { exact: true }).selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();
  await expect(page.getByText("E2E-KLIENT-01")).toBeVisible();
  await expect(page.getByText("Status: Ej aktiv")).toBeVisible();
  await expect(
    page
      .locator(".client-list-link", { hasText: "E2E-KLIENT-01" })
      .getByText("Ingen aktiv primär ansvarig"),
  ).toBeVisible();
  const client = await prisma.client.findFirstOrThrow({
    where: { personIdentifier: "E2E-KLIENT-01" },
  });
  const creationHandoff = page.getByRole("link", {
    name: "Öppna klienten och lägg till tilldelning",
  });
  await expect(creationHandoff).toHaveAttribute(
    "href",
    `/klienter/${client.id}`,
  );
  await creationHandoff.focus();
  await expect(creationHandoff).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter/${client.id}`,
  );
  await expect(
    page.getByRole("heading", { name: "Ansvar och åtkomst" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Klienten är inte aktiv. Lägg till en primär tilldelning för att aktivera klientarbetet.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ny anteckning" })).toHaveCount(
    0,
  );

  await page
    .getByLabel("Medarbetare")
    .selectOption({ label: "Fiktiv Primär – Fiktiv behandlare" });
  await page.getByLabel("Ansvar", { exact: true }).selectOption("PRIMARY");
  await page.getByRole("button", { name: "Lägg till tilldelning" }).click();
  await expect(page.getByText("Tilldelningen har sparats.")).toBeVisible();
  await expect(page.getByText("Aktiv", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ny anteckning" })).toBeVisible();

  await page
    .getByLabel("Medarbetare")
    .selectOption({ label: "Fiktiv Sekundär – Fiktiv behandlare" });
  await page.getByLabel("Ansvar", { exact: true }).selectOption("SECONDARY");
  await page.getByRole("button", { name: "Lägg till tilldelning" }).click();
  await expect(page.getByText("Tilldelningen har sparats.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Aktuellt ansvar" }),
  ).toBeVisible();
  await expect(
    page.locator(".responsibility-summary").getByText("Fiktiv Primär"),
  ).toBeVisible();
  await expect(
    page.locator(".responsibility-summary").getByText("Fiktiv Sekundär"),
  ).toBeVisible();

  await page.goto("/klienter");
  const administratorClientRow = page.locator(".client-list-link", {
    hasText: "E2E-KLIENT-01",
  });
  await expect(administratorClientRow.getByText("Fiktiv Primär")).toBeVisible();
  await administratorClientRow.click();

  const primaryContext = await browser.newContext();
  const primaryPage = await primaryContext.newPage();
  await logIn(primaryPage, primaryEmail, "192.0.2.182");
  const primaryHomeRow = primaryPage.locator(".client-list-link", {
    hasText: "E2E-KLIENT-01",
  });
  await expect(
    primaryPage.getByRole("heading", { name: "Mina klienter" }),
  ).toBeVisible();
  await expect(primaryHomeRow.getByText("Ansvar: Primär")).toBeVisible();
  await primaryHomeRow.click();
  await expect(
    primaryPage.getByRole("heading", { name: "Aktuellt ansvar" }),
  ).toBeVisible();
  await expect(
    primaryPage.getByRole("link", { name: "Personal", exact: true }),
  ).toHaveCount(0);
  await primaryPage.getByRole("link", { name: "Vuxna", exact: true }).click();
  await expect(primaryPage.getByText("E2E-KLIENT-01")).toBeVisible();
  await primaryPage.goto(`/klienter/${client.id}`);
  await expect(
    primaryPage.getByRole("heading", { name: "Fiktiv Klientperson" }),
  ).toBeVisible();

  const unrelatedContext = await browser.newContext();
  const unrelatedPage = await unrelatedContext.newPage();
  await logIn(unrelatedPage, unrelatedEmail, "192.0.2.183");
  await unrelatedPage.goto("/klienter");
  await expect(unrelatedPage.getByText("E2E-KLIENT-01")).toHaveCount(0);
  const inaccessibleResponse = await unrelatedPage.goto(
    `/klienter/${client.id}`,
  );
  expect(inaccessibleResponse?.status()).toBe(404);
  await expect(
    unrelatedPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await expect(unrelatedPage.getByText("Fiktiv Klientperson")).toHaveCount(0);
  await expect(unrelatedPage.getByText("E2E-KLIENT-01")).toHaveCount(0);
  const inaccessibleJournalResponse = await unrelatedPage.goto(
    `/klienter/${client.id}/anteckningar/utkast`,
  );
  expect(inaccessibleJournalResponse?.status()).toBe(404);
  await expect(
    unrelatedPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await expect(unrelatedPage.getByText("Fiktiv Klientperson")).toHaveCount(0);

  const secondaryContext = await browser.newContext();
  const secondaryPage = await secondaryContext.newPage();
  await logIn(secondaryPage, secondaryEmail, "192.0.2.184");
  await expect(
    secondaryPage
      .locator(".client-list-link", { hasText: "E2E-KLIENT-01" })
      .getByText("Ansvar: Sekundär"),
  ).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`/klienter/${client.id}`);
  await page
    .locator("li", { hasText: "Fiktiv Primär" })
    .getByRole("button", {
      name: "Avsluta primär tilldelning för Fiktiv Primär",
    })
    .click();
  await expect(page.getByText("Tilldelningen har avslutats.")).toBeVisible();
  await expect(page.getByText("Ej aktiv", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ansvar och åtkomst" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "De sekundära tilldelningarna är inte avslutade, men ger inte personalen åtkomst så länge klienten saknar en aktiv primär tilldelning.",
    ),
  ).toBeVisible();
  await expect(
    page.locator(".responsibility-summary").getByText("Fiktiv Sekundär"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ny anteckning" })).toHaveCount(
    0,
  );
  await primaryPage.goto("/");
  await expect(primaryPage.getByText("E2E-KLIENT-01")).toHaveCount(0);
  await primaryPage.goto(`/klienter/${client.id}`);
  await expect(
    primaryPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();

  await secondaryPage.goto("/");
  await expect(secondaryPage.getByText("E2E-KLIENT-01")).toHaveCount(0);
  const inactiveSecondaryResponse = await secondaryPage.goto(
    `/klienter/${client.id}`,
  );
  expect(inactiveSecondaryResponse?.status()).toBe(404);
  await expect(
    secondaryPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();

  await page.goto("/klienter");
  await expect(
    page
      .locator(".client-list-link", { hasText: "E2E-KLIENT-01" })
      .getByText("Ingen aktiv primär ansvarig"),
  ).toBeVisible();
  await page.goto(`/klienter/${client.id}`);

  await page
    .getByLabel("Medarbetare")
    .selectOption({ label: "Fiktiv Orelaterad – Fiktiv behandlare" });
  await page.getByLabel("Ansvar", { exact: true }).selectOption("PRIMARY");
  await page.getByRole("button", { name: "Lägg till tilldelning" }).click();
  await expect(page.getByText("Aktiv", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ny anteckning" })).toBeVisible();
  await secondaryPage.goto("/");
  await expect(
    secondaryPage
      .locator(".client-list-link", { hasText: "E2E-KLIENT-01" })
      .getByText("Ansvar: Sekundär"),
  ).toBeVisible();

  await primaryContext.close();
  await secondaryContext.close();
  await unrelatedContext.close();
});

test("Staff Home and responsibility context remain clear at a 375px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const administrator = await prisma.user.findUniqueOrThrow({
    where: { email: administratorEmail },
  });
  const primary = await prisma.user.findUniqueOrThrow({
    where: { email: primaryEmail },
  });
  const secondary = await prisma.user.findUniqueOrThrow({
    where: { email: secondaryEmail },
  });
  const unrelated = await prisma.user.findUniqueOrThrow({
    where: { email: unrelatedEmail },
  });
  const primaryClientId = randomUUID();
  const secondaryClientId = randomUUID();
  const unassignedClientId = randomUUID();

  await prisma.client.createMany({
    data: [
      {
        id: primaryClientId,
        organisationId: primary.organisationId,
        firstName: "Mobil",
        lastName: "Primärklient",
        personIdentifier:
          "HEM-MOBIL-PRIMÄR-LÅNG-REFERENS-012345678901234567890123",
        category: "ADULT",
        status: ClientStatus.ACTIVE,
      },
      {
        id: secondaryClientId,
        organisationId: primary.organisationId,
        firstName: "Mobil",
        lastName: "Sekundärklient",
        personIdentifier: "HEM-MOBIL-SEKUNDÄR",
        category: "YOUTH",
        status: ClientStatus.ACTIVE,
      },
      {
        id: unassignedClientId,
        organisationId: primary.organisationId,
        firstName: "Mobil",
        lastName: "Otilldelad klient",
        personIdentifier: "HEM-MOBIL-OTILLDELAD",
        category: "ADULT",
        status: ClientStatus.ACTIVE,
      },
      {
        id: randomUUID(),
        organisationId: primary.organisationId,
        firstName: "Mobil",
        lastName: "Inaktiv klient",
        personIdentifier: "HEM-MOBIL-INAKTIV",
        category: "ADULT",
        status: ClientStatus.INACTIVE,
      },
      {
        id: randomUUID(),
        organisationId: primary.organisationId,
        firstName: "Mobil",
        lastName: "Arkiverad klient",
        personIdentifier: "HEM-MOBIL-ARKIVERAD",
        category: "YOUTH",
        status: ClientStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    ],
  });
  await prisma.assignment.createMany({
    data: [
      {
        id: randomUUID(),
        organisationId: primary.organisationId,
        clientId: primaryClientId,
        staffUserId: primary.id,
        responsibility: AssignmentResponsibility.PRIMARY,
        createdByUserId: administrator.id,
      },
      {
        id: randomUUID(),
        organisationId: primary.organisationId,
        clientId: primaryClientId,
        staffUserId: secondary.id,
        responsibility: AssignmentResponsibility.SECONDARY,
        createdByUserId: administrator.id,
      },
      {
        id: randomUUID(),
        organisationId: primary.organisationId,
        clientId: secondaryClientId,
        staffUserId: unrelated.id,
        responsibility: AssignmentResponsibility.PRIMARY,
        createdByUserId: administrator.id,
      },
      {
        id: randomUUID(),
        organisationId: primary.organisationId,
        clientId: secondaryClientId,
        staffUserId: primary.id,
        responsibility: AssignmentResponsibility.SECONDARY,
        createdByUserId: administrator.id,
      },
      {
        id: randomUUID(),
        organisationId: primary.organisationId,
        clientId: unassignedClientId,
        staffUserId: unrelated.id,
        responsibility: AssignmentResponsibility.PRIMARY,
        createdByUserId: administrator.id,
      },
    ],
  });

  await logIn(page, primaryEmail, "192.0.2.192");
  const primaryRow = page.locator(".client-list-link", {
    hasText: "HEM-MOBIL-PRIMÄR",
  });
  const secondaryRow = page.locator(".client-list-link", {
    hasText: "HEM-MOBIL-SEKUNDÄR",
  });
  await expect(
    page.getByRole("heading", { name: "Mina klienter" }),
  ).toBeVisible();
  await expect(primaryRow.getByText("Ansvar: Primär")).toBeVisible();
  await expect(secondaryRow.getByText("Ansvar: Sekundär")).toBeVisible();
  await expect(page.getByText("HEM-MOBIL-OTILLDELAD")).toHaveCount(0);
  await expect(page.getByText("HEM-MOBIL-INAKTIV")).toHaveCount(0);
  await expect(page.getByText("HEM-MOBIL-ARKIVERAD")).toHaveCount(0);
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);

  await primaryRow.focus();
  await expect(primaryRow).toBeFocused();
  await primaryRow.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Mobil Primärklient" }),
  ).toBeVisible();
  await expect(
    page.locator(".responsibility-summary").getByText("Primär", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".responsibility-summary").getByText("Sekundär", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".responsibility-summary").getByText("Fiktiv Primär"),
  ).toBeVisible();
  await expect(
    page.locator(".responsibility-summary").getByText("Fiktiv Sekundär"),
  ).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await expect(page.getByRole("link", { name: "Ny anteckning" })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await expect(page.getByRole("link", { name: "Ny anteckning" })).toBeVisible();
});

test("Client categories remain usable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, administratorEmail, "192.0.2.185");
  await page.getByRole("button", { name: "Öppna meny" }).click();
  const clientsNavigation = page.getByRole("button", { name: "Klienter" });
  await expect(clientsNavigation).toHaveAttribute("aria-expanded", "false");
  await clientsNavigation.focus();
  await page.keyboard.press("Enter");
  await expect(clientsNavigation).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Vuxna", exact: true }).click();

  await expect(page.getByLabel("Kategori", { exact: true })).toHaveValue("");
  await page.getByLabel("Förnamn").fill("Vuxen");
  await page.getByLabel("Efternamn").fill("Klient");
  await page.getByLabel("Personreferens").fill("e2e-mobile-adult-01");
  await page.getByLabel("Kategori", { exact: true }).selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();

  await page.getByLabel("Förnamn").fill("Ungdom");
  await page.getByLabel("Efternamn").fill("Klient");
  await page.getByLabel("Personreferens").fill("e2e-mobile-youth-01");
  await page.getByLabel("Kategori", { exact: true }).selectOption("YOUTH");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();

  await page.getByRole("button", { name: "Öppna meny" }).click();
  const mainNavigation = page.getByRole("navigation", {
    name: "Huvudnavigering",
  });
  const adultChoice = mainNavigation.getByRole("link", {
    name: "Vuxna",
    exact: true,
  });
  const youthChoice = mainNavigation.getByRole("link", {
    name: "Ungdomar",
    exact: true,
  });
  await expect(adultChoice).toHaveAttribute("aria-current", "page");
  await expect(youthChoice).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Vuxna" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ungdomar" })).toHaveCount(0);
  await expect(page.getByText("E2E-MOBILE-ADULT-01")).toBeVisible();
  await expect(page.getByText("E2E-MOBILE-YOUTH-01")).toHaveCount(0);

  await adultChoice.focus();
  await page.keyboard.press("Tab");
  await expect(youthChoice).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );
  await expect(page.getByRole("button", { name: "Öppna meny" })).toBeVisible();
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await expect(youthChoice).toHaveAttribute("aria-current", "page");
  await expect(adultChoice).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByText("E2E-MOBILE-ADULT-01")).toHaveCount(0);
  await expect(page.getByText("E2E-MOBILE-YOUTH-01")).toBeVisible();
  await page.getByRole("button", { name: "Stäng meny" }).click();

  await page.goBack();
  await expect(page).toHaveURL(`${testEnvironment.origin}/klienter`);
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await expect(adultChoice).toHaveAttribute("aria-current", "page");
  await expect(youthChoice).not.toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Stäng meny" }).click();
  await page.goForward();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await expect(youthChoice).toHaveAttribute("aria-current", "page");
  await expect(adultChoice).not.toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Stäng meny" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await expect(clientsNavigation).toHaveAttribute("aria-expanded", "true");
  await expect(youthChoice).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Stäng meny" }).click();

  const allClientsChoice = page.getByRole("link", { name: "Alla klienter" });
  await allClientsChoice.click();
  await expect(allClientsChoice).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("E2E-MOBILE-ADULT-01")).toBeVisible();
  await expect(page.getByText("E2E-MOBILE-YOUTH-01")).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);

  await page.getByRole("link", { name: /Ungdom Klient/ }).click();
  await expect(page).toHaveURL(/\/klienter\/[0-9a-f-]+$/);
  await expect(
    page.locator(".client-details dd").filter({ hasText: "Ungdomar" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=alla`,
  );
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await adultChoice.click();
  await page.getByRole("link", { name: /Vuxen Klient/ }).click();
  await expect(page).toHaveURL(/\/klienter\/[0-9a-f-]+$/);
  await expect(
    page.locator(".client-details dd").filter({ hasText: "Vuxna" }),
  ).toBeVisible();
});

test("Administrator edits a Client while conflicts and Staff mutation remain denied", async ({
  browser,
  page,
}) => {
  await logIn(page, administratorEmail, "192.0.2.186");
  await page.goto("/klienter");

  await page.getByLabel("Förnamn").fill("Konflikt");
  await page.getByLabel("Efternamn").fill("Klient");
  await page.getByLabel("Personreferens").fill("e2e-edit-conflict");
  await page.getByLabel("Kategori", { exact: true }).selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();

  await page.getByLabel("Förnamn").fill("Före");
  await page.getByLabel("Efternamn").fill("Redigering");
  await page.getByLabel("Personreferens").fill("e2e-edit-client");
  await page.getByLabel("Kategori", { exact: true }).selectOption("ADULT");
  await page.getByLabel("Personnummer", { exact: true }).fill("19000101-0101");
  await page
    .getByLabel("Placerande enhet", { exact: true })
    .fill("Fiktiv placerande enhet");
  await page.getByLabel("Lagrum", { exact: true }).fill("SoL 4 kap. 1 §");
  await page
    .getByLabel("Namn", { exact: true })
    .fill("Fiktiv socialsekreterare");
  await page.getByLabel("Telefon", { exact: true }).fill("010-123 45 67");
  await page
    .getByLabel("E-post", { exact: true })
    .fill("socialsekreterare@example.test");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();
  await page.getByRole("link", { name: /Före Redigering/ }).click();

  await page.getByRole("link", { name: "Redigera klientuppgifter" }).click();
  await expect(page.getByLabel("Personnummer", { exact: true })).toHaveValue(
    "19000101-0101",
  );
  await expect(
    page.getByLabel("Placerande enhet", { exact: true }),
  ).toHaveValue("Fiktiv placerande enhet");
  await expect(page.getByLabel("Lagrum", { exact: true })).toHaveValue(
    "SoL 4 kap. 1 §",
  );
  await expect(page.getByLabel("Namn", { exact: true })).toHaveValue(
    "Fiktiv socialsekreterare",
  );
  await expect(page.getByLabel("Telefon", { exact: true })).toHaveValue(
    "010-123 45 67",
  );
  await expect(page.getByLabel("E-post", { exact: true })).toHaveValue(
    "socialsekreterare@example.test",
  );
  await page.getByLabel("Förnamn").fill("Efter");
  await page.getByLabel("Efternamn").fill("Redigering");
  await page.getByLabel("Personreferens").fill("e2e-edit-updated");
  await page.getByLabel("Kategori", { exact: true }).selectOption("YOUTH");
  await page.getByLabel("Personnummer", { exact: true }).fill("19000101-0202");
  await page
    .getByLabel("Placerande enhet", { exact: true })
    .fill("Uppdaterad placerande enhet");
  await page.getByLabel("Lagrum", { exact: true }).fill("LVU 1 §");
  await page
    .getByLabel("Namn", { exact: true })
    .fill("Uppdaterad socialsekreterare");
  await page.getByLabel("Telefon", { exact: true }).fill("010-987 65 43");
  await page
    .getByLabel("E-post", { exact: true })
    .fill("uppdaterad.socialsekreterare@example.test");
  const updateRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.headerValue("next-action") !== null,
  );
  await page.getByRole("button", { name: "Spara ändringar" }).click();
  const updateRequest = await updateRequestPromise;
  const updateRequestHeaders = await updateRequest.allHeaders();
  const directUpdateRequest = {
    url: updateRequest.url(),
    body: updateRequest.postData() ?? "",
    headers: Object.fromEntries(
      ["accept", "content-type", "next-action", "next-router-state-tree", "rsc"]
        .map((name) => [name, updateRequestHeaders[name]] as const)
        .filter(
          (entry): entry is readonly [string, string] => entry[1] !== undefined,
        ),
    ),
  };
  await expect(page.getByText("Klientuppgifterna har sparats.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Efter Redigering" }),
  ).toBeVisible();
  await expect(page.getByText("E2E-EDIT-UPDATED")).toBeVisible();
  await expect(page.getByText("Uppdaterad placerande enhet")).toBeVisible();
  await expect(page.getByText("LVU 1 §")).toBeVisible();
  await expect(page.getByText("Uppdaterad socialsekreterare")).toBeVisible();
  await expect(page.getByText("010-987 65 43")).toBeVisible();
  await expect(
    page.getByText("uppdaterad.socialsekreterare@example.test"),
  ).toBeVisible();
  await expect(page.getByText("19000101-0202")).toHaveCount(0);
  await expect(
    page.getByText("Registrerat (visas endast vid redigering)"),
  ).toBeVisible();
  await expect(
    page.locator(".client-details dd").filter({ hasText: "Ungdomar" }),
  ).toBeVisible();

  const editedClient = await prisma.client.findFirstOrThrow({
    where: { personIdentifier: "E2E-EDIT-UPDATED" },
  });
  await page.goto("/klienter?kategori=alla");
  await expect(page.getByText("19000101-0202")).toHaveCount(0);
  const searchInput = page.getByRole("textbox", {
    name: "Sök klienter",
    exact: true,
  });
  await searchInput.fill("19000101-0202");
  await expect(searchInput).toHaveValue("19000101-0202");
  const searchRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined,
  );
  await page.getByRole("button", { name: "Sök", exact: true }).click();
  const searchRequest = await searchRequestPromise;
  expect(new URL(searchRequest.url()).search).toBe("?kategori=alla");
  await expect(page.getByRole("button", { name: "Rensa sökning" })).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(page.getByText("19000101-0202")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Efter Redigering/ }),
  ).toHaveCount(0);
  await expect(page.getByText("E2E-EDIT-UPDATED")).toHaveCount(0);
  await page.goto("/klienter?kategori=ungdomar");
  const youthGroup = page.locator(".client-category-group", {
    has: page.getByRole("heading", { name: "Ungdomar" }),
  });
  await expect(
    youthGroup.getByRole("link", { name: /Efter Redigering/ }),
  ).toBeVisible();

  await page.goto(`/klienter/${editedClient.id}`);
  await page.getByRole("link", { name: "Redigera klientuppgifter" }).click();
  await page.getByLabel("Förnamn").fill("Får inte");
  await page.getByLabel("Efternamn").fill("Sparas");
  await page.getByLabel("Personreferens").fill("e2e-edit-conflict");
  await page.getByLabel("Kategori", { exact: true }).selectOption("ADULT");
  await page.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(
    page.getByText("Personreferensen används redan för en annan klient."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Efter Redigering" }),
  ).toBeVisible();
  await expect(
    prisma.client.findUniqueOrThrow({ where: { id: editedClient.id } }),
  ).resolves.toMatchObject({
    firstName: "Efter",
    lastName: "Redigering",
    personIdentifier: "E2E-EDIT-UPDATED",
    category: "YOUTH",
    personalIdentityNumber: "19000101-0202",
    placingUnit: "Uppdaterad placerande enhet",
    legalBasis: "LVU 1 §",
    responsibleSocialWorkerName: "Uppdaterad socialsekreterare",
    responsibleSocialWorkerPhone: "010-987 65 43",
    responsibleSocialWorkerEmail: "uppdaterad.socialsekreterare@example.test",
  });

  await page
    .getByLabel("Medarbetare")
    .selectOption({ label: "Fiktiv Primär – Fiktiv behandlare" });
  await page.getByLabel("Ansvar", { exact: true }).selectOption("PRIMARY");
  await page.getByRole("button", { name: "Lägg till tilldelning" }).click();
  await expect(page.getByText("Tilldelningen har sparats.")).toBeVisible();

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await logIn(staffPage, primaryEmail, "192.0.2.187");
  await staffPage.goto(`/klienter/${editedClient.id}`);
  await expect(
    staffPage.getByRole("link", { name: "Redigera klientuppgifter" }),
  ).toHaveCount(0);

  const directMutation = await staffPage.evaluate(async (request) => {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      credentials: "same-origin",
    });
    return { ok: response.ok, status: response.status };
  }, directUpdateRequest);
  expect(directMutation.ok).toBe(false);
  await expect(
    prisma.client.findUniqueOrThrow({ where: { id: editedClient.id } }),
  ).resolves.toMatchObject({
    firstName: "Efter",
    lastName: "Redigering",
    personIdentifier: "E2E-EDIT-UPDATED",
    category: "YOUTH",
  });
  const staffUser = await prisma.user.findUniqueOrThrow({
    where: { email: primaryEmail },
  });
  expect(
    await prisma.auditOperation.count({
      where: {
        actorUserId: staffUser.id,
        action: "CLIENT_UPDATED",
        targetId: editedClient.id,
      },
    }),
  ).toBe(0);
  await staffContext.close();
});

test("Client editing remains functional at a 375px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, administratorEmail, "192.0.2.188");
  const client = await prisma.client.findFirstOrThrow({
    where: { personIdentifier: "E2E-EDIT-UPDATED" },
  });
  await page.goto(`/klienter/${client.id}`);
  await page.getByRole("link", { name: "Redigera klientuppgifter" }).click();

  await expect(page.getByLabel("Förnamn")).toBeVisible();
  await expect(page.getByLabel("Efternamn")).toBeVisible();
  await expect(page.getByLabel("Personreferens")).toBeVisible();
  await expect(page.getByLabel("Kategori", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Spara ändringar" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Avbryt" })).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);

  await page.getByRole("button", { name: "Avbryt" }).click();
  await expect(
    page.getByRole("button", { name: "Redigera klient" }),
  ).toBeVisible();
});

test("Administrator archives only after ending all Assignments while Staff remains denied", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  await logIn(page, administratorEmail, "192.0.2.189");
  await page.goto("/klienter");
  await page.getByLabel("Förnamn").fill("Arkiverbar");
  await page.getByLabel("Efternamn").fill("Klient");
  await page.getByLabel("Personreferens").fill("e2e-archive-client");
  await page.getByLabel("Kategori", { exact: true }).selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await page.getByRole("link", { name: /Arkiverbar Klient/ }).click();

  await expect(
    page.getByRole("heading", { name: "Arkivera klient" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Arkivera klient" }),
  ).toBeEnabled();

  await page
    .getByLabel("Medarbetare")
    .selectOption({ label: "Fiktiv Primär – Fiktiv behandlare" });
  await page.getByLabel("Ansvar", { exact: true }).selectOption("PRIMARY");
  await page.getByRole("button", { name: "Lägg till tilldelning" }).click();
  await expect(page.getByText("Tilldelningen har sparats.")).toBeVisible();
  await page
    .getByLabel("Medarbetare")
    .selectOption({ label: "Fiktiv Sekundär – Fiktiv behandlare" });
  await page.getByLabel("Ansvar", { exact: true }).selectOption("SECONDARY");
  await page.getByRole("button", { name: "Lägg till tilldelning" }).click();
  await expect(page.getByText("Tilldelningen har sparats.")).toBeVisible();

  await expect(
    page.getByText(
      "Klienten kan inte arkiveras förrän alla aktiva tilldelningar har avslutats.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Arkivera klient" }),
  ).toBeDisabled();

  for (const staffName of ["Fiktiv Primär", "Fiktiv Sekundär"]) {
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator("li", { hasText: staffName })
      .getByRole("button", {
        name: `Avsluta ${staffName === "Fiktiv Primär" ? "primär" : "sekundär"} tilldelning för ${staffName}`,
      })
      .click();
    await expect(
      page.locator("li", { hasText: staffName }).getByText("Avslutad"),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Arkivera klient" }),
  ).toBeEnabled();

  const client = await prisma.client.findFirstOrThrow({
    where: { personIdentifier: "E2E-ARCHIVE-CLIENT" },
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Arkivera klient" }).click();
  await expect(
    prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
  ).resolves.toMatchObject({
    status: "INACTIVE",
    archivedAt: null,
  });

  page.once("dialog", (dialog) => dialog.accept());
  const archiveRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.headerValue("next-action") !== null,
  );
  await page.getByRole("button", { name: "Arkivera klient" }).click();
  const archiveRequest = await archiveRequestPromise;
  const archiveRequestHeaders = await archiveRequest.allHeaders();
  const directArchiveRequest = {
    url: archiveRequest.url(),
    body: archiveRequest.postData() ?? "",
    headers: Object.fromEntries(
      ["accept", "content-type", "next-action", "next-router-state-tree", "rsc"]
        .map((name) => [name, archiveRequestHeaders[name]] as const)
        .filter(
          (entry): entry is readonly [string, string] => entry[1] !== undefined,
        ),
    ),
  };

  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter/${client.id}?arkiverad=klar`,
  );
  await expect(page.getByText("Klienten har arkiverats.")).toBeVisible();
  await expect(
    page.locator(".client-details dd").filter({ hasText: "Arkiverad" }),
  ).toBeVisible();
  await expect(page.getByText("Fiktiv Primär")).toBeVisible();
  await expect(page.getByText("Fiktiv Sekundär")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Redigera klientuppgifter" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Lägg till tilldelning" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Avsluta tilldelning" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Arkivera klient" }),
  ).toHaveCount(0);

  await page.goto("/klienter");
  await expect(page.getByText("E2E-ARCHIVE-CLIENT")).toHaveCount(0);
  await page.getByRole("link", { name: "Visa arkiverade klienter" }).click();
  await expect(page.getByText("E2E-ARCHIVE-CLIENT")).toBeVisible();
  await page.getByRole("link", { name: /Arkiverbar Klient/ }).click();
  await expect(
    page.getByRole("link", { name: "Till Arkiverade klienter" }),
  ).toBeVisible();

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await logIn(staffPage, primaryEmail, "192.0.2.190");
  await staffPage.goto("/klienter");
  await expect(staffPage.getByText("E2E-ARCHIVE-CLIENT")).toHaveCount(0);
  await expect(
    staffPage.getByRole("link", { name: "Visa arkiverade klienter" }),
  ).toHaveCount(0);
  await staffPage.goto(`/klienter/${client.id}`);
  await expect(
    staffPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();
  await staffPage.goto("/klienter/arkiverade");
  await expect(
    staffPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();

  const directMutation = await staffPage.evaluate(async (request) => {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      credentials: "same-origin",
    });
    return { ok: response.ok, status: response.status };
  }, directArchiveRequest);
  expect(directMutation.ok).toBe(false);
  await expect(
    prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
  ).resolves.toMatchObject({ status: "ARCHIVED" });
  await staffContext.close();
});

test("Client archive list, confirmation, and detail remain usable at 375px", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, administratorEmail, "192.0.2.191");
  await page.goto("/klienter");
  await page.getByLabel("Förnamn").fill("Mobilarkiv");
  await page.getByLabel("Efternamn").fill("Klient");
  await page.getByLabel("Personreferens").fill("e2e-mobile-archive");
  await page.getByLabel("Kategori", { exact: true }).selectOption("YOUTH");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page
    .getByRole("navigation", { name: "Huvudnavigering" })
    .getByRole("link", { name: "Ungdomar", exact: true })
    .click();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );
  await page.getByRole("link", { name: /Mobilarkiv Klient/ }).click();

  await expect(
    page.getByText("Åtgärden kan inte ångras i Kaul.", { exact: false }),
  ).toHaveCount(0);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Åtgärden kan inte ångras i Kaul.");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Arkivera klient" }).click();
  await expect(page.getByText("Klienten har arkiverats.")).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);

  await page.getByRole("link", { name: "Till Arkiverade klienter" }).click();
  await expect(page.getByText("E2E-MOBILE-ARCHIVE")).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await page.getByRole("link", { name: /Mobilarkiv Klient/ }).click();
  await expect(
    page.locator(".client-details dd").filter({ hasText: "Arkiverad" }),
  ).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
});
