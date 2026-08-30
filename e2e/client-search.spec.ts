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
const administratorEmail = "client.search.administrator@example.test";
const staffEmail = "client.search.staff@example.test";
const password = "Fictional Client Search password 2032";
const fixtureEmails = [administratorEmail, staffEmail];
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
  return prisma.user.findUniqueOrThrow({ where: { email } });
}

async function createFixtures(): Promise<void> {
  const organisationId = randomUUID();
  await prisma.organisation.create({
    data: {
      id: organisationId,
      name: "Fiktiva Klientsökorganisationen",
    },
  });
  const administrator = await createFixtureUser(
    organisationId,
    "Fiktiv Sökadministratör",
    administratorEmail,
    UserRole.ADMINISTRATOR,
  );
  const staff = await createFixtureUser(
    organisationId,
    "Fiktiv Sökmedarbetare",
    staffEmail,
    UserRole.STAFF_MEMBER,
  );
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        id: randomUUID(),
        organisationId,
        firstName: "Sökbar",
        lastName: "Vuxen",
        personIdentifier: "SÖK-VUXEN-01",
        category: "ADULT",
        status: ClientStatus.INACTIVE,
      },
    }),
    prisma.client.create({
      data: {
        id: randomUUID(),
        organisationId,
        firstName: "Referens",
        lastName: "Ungdom",
        personIdentifier:
          "SÖK-UNGDOM-MOBIL-LÅNG-PERSONREFERENS-012345678901234567890123",
        category: "YOUTH",
        status: ClientStatus.ACTIVE,
      },
    }),
    prisma.client.create({
      data: {
        id: randomUUID(),
        organisationId,
        firstName: "Tilldelad",
        lastName: "Synlig",
        personIdentifier: "STAFF-SYNLIG-01",
        category: "ADULT",
        status: ClientStatus.ACTIVE,
      },
    }),
    prisma.client.create({
      data: {
        id: randomUUID(),
        organisationId,
        firstName: "Otilldelad",
        lastName: "Hemlig",
        personIdentifier: "STAFF-HEMLIG-01",
        category: "YOUTH",
        status: ClientStatus.ACTIVE,
      },
    }),
  ]);
  await prisma.assignment.create({
    data: {
      id: randomUUID(),
      organisationId,
      clientId: clients[2].id,
      staffUserId: staff.id,
      responsibility: AssignmentResponsibility.PRIMARY,
      createdByUserId: administrator.id,
    },
  });
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

async function submitSearch(page: Page, query: string) {
  await page.getByRole("textbox", { name: "Sök klienter" }).fill(query);
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined,
  );
  await page.getByRole("button", { name: "Sök", exact: true }).click();
  return requestPromise;
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

test("Administrator search is submitted privately and keeps category grouping", async ({
  page,
}) => {
  await logIn(page, administratorEmail, "192.0.2.211");
  await page.goto("/klienter");

  const partialRequest = await submitSearch(page, "sökbar");
  expect(new URL(partialRequest.url()).search).toBe("");
  await expect(page).toHaveURL(`${testEnvironment.origin}/klienter`);
  await expect(page.getByText("SÖK-VUXEN-01")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vuxna" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ungdomar" })).toHaveCount(0);

  await page.getByRole("link", { name: "Ungdomar", exact: true }).click();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );
  await submitSearch(
    page,
    "sök-ungdom-mobil-lång-personreferens-012345678901234567890123",
  );
  await expect(page.getByText(/SÖK-UNGDOM-MOBIL-LÅNG/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ungdomar" })).toBeVisible();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );
  expect(await page.evaluate(() => window.location.search)).toBe(
    "?kategori=ungdomar",
  );

  await page.getByRole("button", { name: "Rensa sökning" }).click();
  await expect(page.getByText("SÖK-VUXEN-01")).toHaveCount(0);
  await expect(page.getByText("STAFF-HEMLIG-01")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vuxna" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ungdomar" })).toBeVisible();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );

  await page.getByRole("link", { name: "Alla klienter" }).click();
  await expect(page.getByText("SÖK-VUXEN-01")).toBeVisible();
  await expect(page.getByText("STAFF-HEMLIG-01")).toBeVisible();

  await page.getByLabel("Förnamn").fill("Efter");
  await page.getByLabel("Efternamn").fill("Sökning");
  await page.getByLabel("Personreferens").fill("SÖK-EFTER-RESET");
  await page.getByLabel("Kategori", { exact: true }).selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();
  await expect(page.getByText("SÖK-EFTER-RESET")).toBeVisible();

  await submitSearch(page, "sökbar");
  await expect(page.getByText("SÖK-EFTER-RESET")).toHaveCount(0);
  await submitSearch(page, "   ");
  await expect(page.getByText("SÖK-EFTER-RESET")).toBeVisible();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=alla`,
  );
});

test("Staff search discloses only assigned Clients and uses one no-result state", async ({
  page,
}) => {
  await logIn(page, staffEmail, "192.0.2.212");
  await page.goto("/klienter");

  await submitSearch(page, "tilldelad synlig");
  await expect(page.getByText("STAFF-SYNLIG-01")).toBeVisible();

  await submitSearch(page, "Otilldelad Hemlig");
  const adultNoResult = page.getByText(
    "Inga klienter under Vuxna matchar din sökning.",
  );
  await expect(adultNoResult).toBeVisible();
  await expect(page.getByText("STAFF-HEMLIG-01")).toHaveCount(0);
  await expect(page.getByText("Otilldelad Hemlig")).toHaveCount(0);

  await page.getByRole("link", { name: "Ungdomar", exact: true }).click();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );
  await submitSearch(page, "STAFF-HEMLIG-01");
  await expect(
    page.getByText("Inga klienter under Ungdomar matchar din sökning."),
  ).toBeVisible();
  await expect(page.getByText("STAFF-HEMLIG-01")).toHaveCount(0);
  await expect(page.getByText(/resultat|förslag|behörighet/i)).toHaveCount(0);
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );
});

test("Client search remains keyboard-usable without mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, administratorEmail, "192.0.2.213");
  await page.goto("/klienter");

  await page.getByRole("link", { name: "Ungdomar", exact: true }).click();
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );

  const searchInput = page.getByRole("textbox", { name: "Sök klienter" });
  const searchButton = page.getByRole("button", { name: "Sök", exact: true });
  await searchInput.focus();
  await page.keyboard.press("Tab");
  await expect(searchButton).toBeFocused();

  await searchInput.fill(
    "SÖK-UNGDOM-MOBIL-LÅNG-PERSONREFERENS-012345678901234567890123",
  );
  await searchInput.press("Enter");
  await expect(page.getByText(/SÖK-UNGDOM-MOBIL-LÅNG/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rensa sökning" }),
  ).toBeVisible();

  const inputBox = await searchInput.boundingBox();
  const buttonBox = await searchButton.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox?.y).toBeGreaterThan(inputBox?.y ?? 0);
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await expect(page).toHaveURL(
    `${testEnvironment.origin}/klienter?kategori=ungdomar`,
  );
});
