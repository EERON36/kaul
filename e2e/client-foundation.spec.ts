import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, UserRole } from "../src/generated/prisma/client";
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

test("Client assignment controls access, revocation, and secondary regain", async ({
  browser,
  page,
}) => {
  await logIn(page, administratorEmail, "192.0.2.181");
  await expect(page.getByRole("link", { name: "Klienter" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Personal" })).toBeVisible();
  await page.getByRole("link", { name: "Klienter" }).click();
  await page.getByLabel("Förnamn").fill("Fiktiv");
  await page.getByLabel("Efternamn").fill("Klientperson");
  await page.getByLabel("Personreferens").fill("e2e-klient-01");
  await page.getByLabel("Kategori").selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();
  await expect(page.getByText("E2E-KLIENT-01")).toBeVisible();
  await expect(page.getByText("Status: Ej aktiv")).toBeVisible();
  await page.getByRole("link", { name: /Fiktiv Klientperson/ }).click();

  await page
    .getByLabel("Medarbetare")
    .selectOption({ label: "Fiktiv Primär – Fiktiv behandlare" });
  await page.getByLabel("Ansvar", { exact: true }).selectOption("PRIMARY");
  await page.getByRole("button", { name: "Lägg till tilldelning" }).click();
  await expect(page.getByText("Tilldelningen har sparats.")).toBeVisible();
  await expect(page.getByText("Aktiv", { exact: true })).toBeVisible();

  await page
    .getByLabel("Medarbetare")
    .selectOption({ label: "Fiktiv Sekundär – Fiktiv behandlare" });
  await page.getByLabel("Ansvar", { exact: true }).selectOption("SECONDARY");
  await page.getByRole("button", { name: "Lägg till tilldelning" }).click();
  await expect(page.getByText("Tilldelningen har sparats.")).toBeVisible();

  const client = await prisma.client.findFirstOrThrow({
    where: { personIdentifier: "E2E-KLIENT-01" },
  });
  const primaryContext = await browser.newContext();
  const primaryPage = await primaryContext.newPage();
  await logIn(primaryPage, primaryEmail, "192.0.2.182");
  await expect(primaryPage.getByRole("link", { name: "Personal" })).toHaveCount(
    0,
  );
  await primaryPage.getByRole("link", { name: "Klienter" }).click();
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
  await unrelatedPage.goto(`/klienter/${client.id}`);
  await expect(
    unrelatedPage.getByText("This page could not be found"),
  ).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`/klienter/${client.id}`);
  await page
    .locator("li", { hasText: "Fiktiv Primär" })
    .getByRole("button", { name: "Avsluta tilldelning" })
    .click();
  await expect(page.getByText("Tilldelningen har avslutats.")).toBeVisible();
  await expect(page.getByText("Ej aktiv", { exact: true })).toBeVisible();
  await primaryPage.goto("/klienter");
  await expect(primaryPage.getByText("E2E-KLIENT-01")).toHaveCount(0);
  await primaryPage.goto(`/klienter/${client.id}`);
  await expect(
    primaryPage.getByText("This page could not be found"),
  ).toBeVisible();

  const secondaryContext = await browser.newContext();
  const secondaryPage = await secondaryContext.newPage();
  await logIn(secondaryPage, secondaryEmail, "192.0.2.184");
  await secondaryPage.goto("/klienter");
  await expect(secondaryPage.getByText("E2E-KLIENT-01")).toHaveCount(0);

  await page
    .getByLabel("Medarbetare")
    .selectOption({ label: "Fiktiv Orelaterad – Fiktiv behandlare" });
  await page.getByLabel("Ansvar", { exact: true }).selectOption("PRIMARY");
  await page.getByRole("button", { name: "Lägg till tilldelning" }).click();
  await expect(page.getByText("Aktiv", { exact: true })).toBeVisible();
  await secondaryPage.goto("/klienter");
  await expect(secondaryPage.getByText("E2E-KLIENT-01")).toBeVisible();

  await primaryContext.close();
  await secondaryContext.close();
  await unrelatedContext.close();
});

test("Client categories remain usable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, administratorEmail, "192.0.2.185");
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page.getByRole("link", { name: "Klienter" }).click();

  await expect(page.getByLabel("Kategori")).toHaveValue("");
  await page.getByLabel("Förnamn").fill("Vuxen");
  await page.getByLabel("Efternamn").fill("Klient");
  await page.getByLabel("Personreferens").fill("e2e-mobile-adult-01");
  await page.getByLabel("Kategori").selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();

  await page.getByLabel("Förnamn").fill("Ungdom");
  await page.getByLabel("Efternamn").fill("Klient");
  await page.getByLabel("Personreferens").fill("e2e-mobile-youth-01");
  await page.getByLabel("Kategori").selectOption("YOUTH");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Vuxna" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ungdomar" })).toBeVisible();
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
  await expect(page).toHaveURL(`${testEnvironment.origin}/klienter`);
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
  await page.getByLabel("Kategori").selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();

  await page.getByLabel("Förnamn").fill("Före");
  await page.getByLabel("Efternamn").fill("Redigering");
  await page.getByLabel("Personreferens").fill("e2e-edit-client");
  await page.getByLabel("Kategori").selectOption("ADULT");
  await page.getByRole("button", { name: "Skapa klient" }).click();
  await expect(page.getByText("Klienten har skapats.")).toBeVisible();
  await page.getByRole("link", { name: /Före Redigering/ }).click();

  await page.getByRole("button", { name: "Redigera klient" }).click();
  await page.getByLabel("Förnamn").fill("Efter");
  await page.getByLabel("Efternamn").fill("Redigering");
  await page.getByLabel("Personreferens").fill("e2e-edit-updated");
  await page.getByLabel("Kategori").selectOption("YOUTH");
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
  await expect(
    page.locator(".client-details dd").filter({ hasText: "Ungdomar" }),
  ).toBeVisible();

  const editedClient = await prisma.client.findFirstOrThrow({
    where: { personIdentifier: "E2E-EDIT-UPDATED" },
  });
  await page.goto("/klienter");
  const youthGroup = page.locator(".client-category-group", {
    has: page.getByRole("heading", { name: "Ungdomar" }),
  });
  await expect(
    youthGroup.getByRole("link", { name: /Efter Redigering/ }),
  ).toBeVisible();

  await page.goto(`/klienter/${editedClient.id}`);
  await page.getByRole("button", { name: "Redigera klient" }).click();
  await page.getByLabel("Förnamn").fill("Får inte");
  await page.getByLabel("Efternamn").fill("Sparas");
  await page.getByLabel("Personreferens").fill("e2e-edit-conflict");
  await page.getByLabel("Kategori").selectOption("ADULT");
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
    staffPage.getByRole("button", { name: "Redigera klient" }),
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
  await page.getByRole("button", { name: "Redigera klient" }).click();

  await expect(page.getByLabel("Förnamn")).toBeVisible();
  await expect(page.getByLabel("Efternamn")).toBeVisible();
  await expect(page.getByLabel("Personreferens")).toBeVisible();
  await expect(page.getByLabel("Kategori")).toBeVisible();
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
