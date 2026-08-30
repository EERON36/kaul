import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";
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
const administratorEmail = "slice5.e2e.administrator@example.test";
const staffEmail = "slice5.e2e.staff@example.test";
const administratorPassword = "Fictional administrator password 2031";
const staffReplacementPassword = "Fictional staff replacement password 2031";
const staffFinalPassword = "Fictional staff final password after reset 2031";
const fixtureEmails = [administratorEmail, staffEmail];
const rateLimitKeys = new Set<string>();

type Rgb = readonly [number, number, number];

function parseRgb(value: string): Rgb {
  const match = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);

  if (!match) {
    throw new Error(`Expected an RGB colour, received ${value}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const luminance = ([red, green, blue]: Rgb) => {
    const channels = [red, green, blue].map((channel) => {
      const value = channel / 255;

      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);

  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

async function tabTo(page: Page, target: Locator, maximumTabs = 30) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });

  for (let step = 0; step < maximumTabs; step += 1) {
    await page.keyboard.press("Tab");
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }

  throw new Error(
    "The expected control was not reached by keyboard navigation.",
  );
}

async function expectVisibleFocusWithContrast(
  target: Locator,
  surface: "LIGHT" | "DARK",
) {
  await expect(target).toBeFocused();
  const style = await target.evaluate((element) => {
    const computed = getComputedStyle(element);
    const sidebar = element.closest(".sidebar");

    return {
      boxShadow: computed.boxShadow,
      outlineColor: computed.outlineColor,
      outlineOffset: computed.outlineOffset,
      outlineStyle: computed.outlineStyle,
      outlineWidth: computed.outlineWidth,
      surfaceColor:
        sidebar === null
          ? computed.backgroundColor
          : getComputedStyle(sidebar).backgroundColor,
    };
  });

  expect(style.outlineStyle).toBe("solid");
  expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(3);
  expect(Number.parseFloat(style.outlineOffset)).toBeGreaterThanOrEqual(3);

  const focusColor =
    surface === "LIGHT"
      ? parseRgb(style.outlineColor)
      : parseRgb(style.boxShadow);

  expect(
    contrastRatio(focusColor, parseRgb(style.surfaceColor)),
  ).toBeGreaterThanOrEqual(3);
}

async function cleanupFixtures(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: fixtureEmails } },
    select: { id: true, organisationId: true },
  });
  const userIds = users.map(({ id }) => id);
  const organisationIds = users.map(({ organisationId }) => organisationId);

  if (userIds.length > 0) {
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

async function createAdministrator(): Promise<void> {
  const organisationId = randomUUID();
  await prisma.organisation.create({
    data: { id: organisationId, name: "Fiktiva Stafforganisationen" },
  });
  await fixtureAuthentication.api.createUser({
    body: {
      name: "Fiktiv Administratör",
      email: administratorEmail,
      password: administratorPassword,
      role: UserRole.ADMINISTRATOR,
      data: {
        organisationId,
        professionalTitle: "Fiktiv verksamhetsansvarig",
        mustChangePassword: false,
        temporaryCredentialExpiresAt: null,
      },
    },
  });
}

async function logIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  const ipAddress =
    email === administratorEmail ? "192.0.2.161" : "192.0.2.162";
  rateLimitKeys.add(`${ipAddress}|/sign-in/email`);
  await page.setExtraHTTPHeaders({ "x-real-ip": ipAddress });
  await page.goto("/login");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord").fill(password);
  await page.getByRole("button", { name: "Logga in" }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanupFixtures();
  await createAdministrator();
});

test.afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

test("Administrator creates, deactivates, and reactivates a Staff Member", async ({
  browser,
  page,
}) => {
  await logIn(page, administratorEmail, administratorPassword);
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);
  await page.getByRole("link", { name: "Personal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Personal", exact: true }),
  ).toBeVisible();

  await page.getByLabel("Namn").fill("Fiktiv Medarbetare");
  await page.getByLabel("E-post").fill(staffEmail);
  await page.getByLabel("Yrkestitel").fill("Fiktiv behandlare");
  await page.getByRole("button", { name: "Skapa medarbetare" }).click();
  await expect(page.getByText("Kontot har skapats.")).toBeVisible();
  const credentialText = await page
    .locator(".credential-result code")
    .textContent();
  expect(credentialText).toBeTruthy();
  const temporaryCredential = credentialText ?? "";
  await expect(page.getByText("Fiktiv Medarbetare")).toBeVisible();
  await expect(page.getByText(/Status:\s*Aktiv/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Inaktivera Fiktiv Medarbetare",
    }),
  ).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".credential-result code")).toHaveCount(0);

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await logIn(staffPage, staffEmail, temporaryCredential);
  await expect(staffPage).toHaveURL(/\/byt-losenord$/);
  await staffPage.getByLabel("Nuvarande lösenord").fill(temporaryCredential);
  await staffPage
    .getByLabel("Nytt lösenord", { exact: true })
    .fill(staffReplacementPassword);
  await staffPage
    .getByLabel("Bekräfta nytt lösenord")
    .fill(staffReplacementPassword);
  await staffPage.getByRole("button", { name: "Spara nytt lösenord" }).click();
  await expect(staffPage).toHaveURL(`${testEnvironment.origin}/`);
  await expect(
    staffPage.getByRole("link", { name: "Personal", exact: true }),
  ).toHaveCount(0);
  await staffPage.goto("/personal");
  await expect(staffPage).toHaveURL(/\/personal$/);
  await expect(
    staffPage.getByRole("heading", { name: "Sidan kunde inte hittas" }),
  ).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/personal");
  await page
    .getByRole("button", { name: "Inaktivera Fiktiv Medarbetare" })
    .click();
  await expect(page.getByText("Medarbetaren har inaktiverats.")).toBeVisible();
  await expect(page.getByText(/Status:\s*Inaktiv/)).toBeVisible();
  expect(
    await prisma.session.count({
      where: { user: { email: staffEmail } },
    }),
  ).toBe(0);

  await staffPage.goto("/");
  await expect(staffPage).toHaveURL(/\/login$/);
  await logIn(staffPage, staffEmail, staffReplacementPassword);
  await expect(staffPage).toHaveURL(/\/login$/);
  await expect(
    staffPage.getByText(/Det gick inte att logga in\. Kontrollera uppgifterna/),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Återaktivera Fiktiv Medarbetare" })
    .click();
  await expect(
    page.getByText("Medarbetaren har återaktiverats."),
  ).toBeVisible();
  await expect(page.getByText(/Status:\s*Aktiv/)).toBeVisible();
  await logIn(staffPage, staffEmail, staffReplacementPassword);
  await expect(staffPage).toHaveURL(`${testEnvironment.origin}/`);

  await page
    .getByRole("button", { name: "Återställ lösenord för Fiktiv Medarbetare" })
    .click();
  await expect(page.getByText("Lösenordet har återställts.")).toBeVisible();
  await expect(
    page.getByText(
      /Godkänd leveranskanal för produktion är ännu inte beslutad/,
    ),
  ).toBeVisible();
  const resetCredentialText = await page
    .locator(".staff-card .credential-result code")
    .textContent();
  expect(resetCredentialText).toBeTruthy();
  const resetCredential = resetCredentialText ?? "";

  await page.reload();
  await expect(page.locator(".staff-card .credential-result code")).toHaveCount(
    0,
  );
  await expect(page.getByText(/Status:\s*Aktiv/)).toBeVisible();

  await staffPage.goto("/");
  await expect(staffPage).toHaveURL(/\/login$/);
  await logIn(staffPage, staffEmail, staffReplacementPassword);
  await expect(staffPage).toHaveURL(/\/login$/);
  await logIn(staffPage, staffEmail, resetCredential);
  await expect(staffPage).toHaveURL(/\/byt-losenord$/);
  await staffPage.getByLabel("Nuvarande lösenord").fill(resetCredential);
  await staffPage
    .getByLabel("Nytt lösenord", { exact: true })
    .fill(staffFinalPassword);
  await staffPage.getByLabel("Bekräfta nytt lösenord").fill(staffFinalPassword);
  await staffPage.getByRole("button", { name: "Spara nytt lösenord" }).click();
  await expect(staffPage).toHaveURL(`${testEnvironment.origin}/`);
  await expect(staffPage.getByRole("link", { name: "Hem" })).toBeVisible();
  await expect(
    staffPage.getByRole("button", { name: "Klienter" }),
  ).toBeVisible();
  await expect(
    staffPage.getByRole("link", { name: "Personal", exact: true }),
  ).toHaveCount(0);
  await staffContext.close();

  const staff = await prisma.user.findUniqueOrThrow({
    where: { email: staffEmail },
    select: { role: true, organisationId: true },
  });
  const administrator = await prisma.user.findUniqueOrThrow({
    where: { email: administratorEmail },
    select: { organisationId: true },
  });
  expect(staff).toEqual({
    role: UserRole.STAFF_MEMBER,
    organisationId: administrator.organisationId,
  });
});

test("Staff actions have specific names and keyboard focus remains distinct on both surfaces", async ({
  page,
}) => {
  await logIn(page, administratorEmail, administratorPassword);
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);
  await page.goto("/personal");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  await expect(
    page.getByRole("button", {
      name: "Inaktivera Fiktiv Medarbetare",
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: "Återställ lösenord för Fiktiv Medarbetare",
    }),
  ).toHaveCount(1);

  const clientsNavigation = page
    .locator(".sidebar")
    .getByRole("button", { name: "Klienter", exact: true });
  await tabTo(page, clientsNavigation);
  await expectVisibleFocusWithContrast(clientsNavigation, "DARK");

  const staffName = page.getByLabel("Namn");
  await tabTo(page, staffName);
  await expectVisibleFocusWithContrast(staffName, "LIGHT");
});

test("Personal remains usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, administratorEmail, administratorPassword);
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page.getByRole("link", { name: "Personal", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Personal", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Namn")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skapa medarbetare" }),
  ).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
});
