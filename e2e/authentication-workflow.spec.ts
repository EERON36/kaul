import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
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
const workflowBrowserIp = "192.0.2.121";
const fixtureIds = new Set<string>();
const fixtureUserIds = new Set<string>();
const fixtureRateLimitKeys = new Set<string>([
  `${workflowBrowserIp}|/sign-in/email`,
]);

const administratorEmail = "slice4.administrator@example.test";
const temporaryPassword = "Fictional temporary password 2030";
const replacementPassword = "Fictional replacement passphrase 2030";
const nativeFallbackEmail = "slice4.native-fallback@example.test";
const nativeFallbackCurrentPassword =
  "Fictional native fallback current password 2030";
const nativeFallbackNewPassword =
  "Fictional native fallback replacement password 2030";
const fixtureEmails = [
  administratorEmail,
  nativeFallbackEmail,
  "slice4.expired@example.test",
  "slice4.aged-session@example.test",
  "slice4.banned@example.test",
];

const credentialFieldNames = [
  "email",
  "password",
  "currentPassword",
  "newPassword",
  "confirmPassword",
] as const;

function expectCredentialFreeUrl(url: string, canaries: readonly string[]) {
  const parsedUrl = new URL(url);
  const decodedUrl = decodeURIComponent(parsedUrl.href.replaceAll("+", "%20"));

  expect(parsedUrl.search).toBe("");
  expect(parsedUrl.hash).toBe("");
  for (const fieldName of credentialFieldNames) {
    expect(parsedUrl.searchParams.has(fieldName)).toBe(false);
  }
  for (const canary of canaries) {
    expect(decodedUrl).not.toContain(canary);
  }
}

async function blockApplicationScripts(context: BrowserContext) {
  let blockedScriptCount = 0;

  await context.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") {
      blockedScriptCount += 1;
      await route.abort();
      return;
    }

    await route.continue();
  });

  return () => blockedScriptCount;
}

async function expectNativePostWithoutCredentialHistory(options: {
  page: Page;
  pathname: "/login" | "/byt-losenord";
  buttonName: string;
  canaries: readonly string[];
}) {
  const { page, pathname, buttonName, canaries } = options;
  const nativeNavigation = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      new URL(request.url()).pathname === pathname,
  );

  await page.getByRole("button", { name: buttonName }).click();
  const request = await nativeNavigation;
  expect(new URL(request.url()).origin).toBe(testEnvironment.origin);
  expect(request.method()).toBe("POST");
  expectCredentialFreeUrl(request.url(), canaries);
  await request.response();
  expectCredentialFreeUrl(page.url(), canaries);

  const session = await page.context().newCDPSession(page);
  try {
    const history = await session.send("Page.getNavigationHistory");
    for (const entry of history.entries) {
      expectCredentialFreeUrl(entry.url, canaries);
    }
  } finally {
    await session.detach();
  }
}

function headersFor(ipAddress: string) {
  fixtureRateLimitKeys.add(`${ipAddress}|/sign-in/email`);
  return new Headers({
    origin: testEnvironment.origin,
    "x-real-ip": ipAddress,
  });
}

async function createFixtureUser(options: {
  email: string;
  password: string;
  banned?: boolean;
  mustChangePassword: boolean;
  temporaryCredentialExpiresAt: Date | null;
}) {
  const organisationId = randomUUID();
  fixtureIds.add(organisationId);
  await prisma.organisation.create({
    data: { id: organisationId, name: "Fiktiva Omsorgen" },
  });
  const created = await fixtureAuthentication.api.createUser({
    body: {
      name: "Fiktiv Administratör",
      email: options.email,
      password: options.password,
      role: UserRole.ADMINISTRATOR,
      data: {
        organisationId,
        professionalTitle: "Fiktiv verksamhetsansvarig",
        mustChangePassword: options.mustChangePassword,
        temporaryCredentialExpiresAt: options.temporaryCredentialExpiresAt,
      },
    },
  });
  fixtureUserIds.add(created.user.id);

  if (options.banned) {
    await prisma.user.update({
      where: { id: created.user.id },
      data: { banned: true },
    });
  }

  return created.user.id;
}

async function cleanupFixtures() {
  const persistedFixtures = await prisma.user.findMany({
    where: { email: { in: fixtureEmails } },
    select: { id: true, organisationId: true },
  });
  persistedFixtures.forEach(({ id, organisationId }) => {
    fixtureUserIds.add(id);
    fixtureIds.add(organisationId);
  });

  if (fixtureUserIds.size > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: [...fixtureUserIds] } },
    });
  }
  if (fixtureIds.size > 0) {
    await prisma.organisation.deleteMany({
      where: { id: { in: [...fixtureIds] } },
    });
  }
  if (fixtureRateLimitKeys.size > 0) {
    await prisma.rateLimit.deleteMany({
      where: { key: { in: [...fixtureRateLimitKeys] } },
    });
  }
  fixtureUserIds.clear();
  fixtureIds.clear();
  fixtureRateLimitKeys.clear();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanupFixtures();
});

test.afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

test("completes login, forced password change, shell access, logout, and new login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  fixtureRateLimitKeys.add(`${workflowBrowserIp}|/sign-in/email`);
  await page.setExtraHTTPHeaders({ "x-real-ip": workflowBrowserIp });
  const userId = await createFixtureUser({
    email: administratorEmail,
    password: temporaryPassword,
    mustChangePassword: true,
    temporaryCredentialExpiresAt: new Date("2099-01-01T00:00:00Z"),
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("E-post")).toHaveAttribute(
    "autocomplete",
    "username",
  );
  await expect(page.getByLabel("Lösenord")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await expect(page.getByRole("link", { name: /registr/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /glömt/i })).toHaveCount(0);
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);

  await page.getByLabel("E-post").fill(administratorEmail);
  await page.getByLabel("Lösenord").fill("Fictional wrong password 2030");
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(
    page.getByText(/Det gick inte att logga in\. Kontrollera uppgifterna/),
  ).toBeVisible();

  await page.getByLabel("Lösenord").fill(temporaryPassword);
  const loginRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Logga in" }).click();
  const loginRequest = await loginRequestPromise;
  expect(loginRequest.postDataJSON()).toEqual({
    email: administratorEmail,
    password: temporaryPassword,
  });
  await expect(page).toHaveURL(/\/byt-losenord$/);
  await expect(
    page.getByRole("heading", { name: "Byt lösenord" }),
  ).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);

  await page.goto("/");
  await expect(page).toHaveURL(/\/byt-losenord$/);
  await expect(page.getByLabel("Nuvarande lösenord")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await expect(
    page.getByLabel("Nytt lösenord", { exact: true }),
  ).toHaveAttribute("autocomplete", "new-password");
  await expect(
    page.getByLabel("Nytt lösenord", { exact: true }),
  ).toHaveAttribute("minlength", "15");
  await expect(
    page.getByLabel("Nytt lösenord", { exact: true }),
  ).toHaveAttribute("maxlength", "128");

  await page.getByLabel("Nuvarande lösenord").fill(temporaryPassword);
  await page
    .getByLabel("Nytt lösenord", { exact: true })
    .fill("Fictional valid password 2030");
  await page
    .getByLabel("Bekräfta nytt lösenord")
    .fill("Different fictional password 2030");
  await page.getByRole("button", { name: "Spara nytt lösenord" }).click();
  await expect(
    page.getByText("De nya lösenorden stämmer inte överens."),
  ).toBeVisible();

  await page
    .getByLabel("Nytt lösenord", { exact: true })
    .fill(replacementPassword);
  await page.getByLabel("Bekräfta nytt lösenord").fill(replacementPassword);
  await page.getByRole("button", { name: "Spara nytt lösenord" }).click();
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);
  await expect(page.getByRole("heading", { name: "Översikt" })).toBeVisible();
  const menuButton = page.locator(".mobile-menu-button");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Fiktiv Administratör")).toBeVisible();
  await expect(page.getByText("Fiktiv verksamhetsansvarig")).toBeVisible();
  await expect(page.getByText("Fiktiva Omsorgen")).toBeVisible();
  await expect(page.getByText("Administratör", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hem" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Personal", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: /Dokument|Sök|Inställningar/,
    }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toBeFocused();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await expect(page.getByText(userId)).toHaveCount(0);
  await expect(page.getByText(/organisation_/)).toHaveCount(0);

  await page.setExtraHTTPHeaders({
    "x-kaul-role": "STAFF_MEMBER",
    "x-kaul-organisation-id": "browser-controlled",
    "x-real-ip": workflowBrowserIp,
  });
  await page.reload();
  await menuButton.click();
  await expect(page.getByText("Administratör", { exact: true })).toBeVisible();
  await expect(page.getByText("Fiktiva Omsorgen")).toBeVisible();
  await page.keyboard.press("Escape");

  const sessionsBeforeLogout = await prisma.session.count({
    where: { userId },
  });
  expect(sessionsBeforeLogout).toBeGreaterThan(0);
  const rawSignOutResponse = await page.request.post(
    `${testEnvironment.origin}/api/auth/sign-out`,
    { headers: { origin: testEnvironment.origin } },
  );
  expect(rawSignOutResponse.status()).toBe(404);
  await expect(prisma.session.count({ where: { userId } })).resolves.toBe(
    sessionsBeforeLogout,
  );
  await menuButton.click();
  await page.getByRole("button", { name: "Logga ut" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(prisma.session.count({ where: { userId } })).resolves.toBe(0);
  await expect(
    prisma.auditOperation.findFirstOrThrow({
      where: { actorUserId: userId, action: "LOGOUT_SUCCEEDED" },
      orderBy: { createdAt: "desc" },
      select: {
        actorKind: true,
        actorUserId: true,
        targetType: true,
        targetId: true,
        events: {
          select: { type: true, result: true, resolvedTargetId: true },
        },
      },
    }),
  ).resolves.toEqual({
    actorKind: "USER",
    actorUserId: userId,
    targetType: "AUTHENTICATION",
    targetId: null,
    events: [{ type: "OUTCOME", result: "SUCCEEDED", resolvedTargetId: null }],
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("E-post").fill(administratorEmail);
  await page.getByLabel("Lösenord").fill(temporaryPassword);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(
    page.getByText(/Det gick inte att logga in\. Kontrollera uppgifterna/),
  ).toBeVisible();

  await page.getByLabel("Lösenord").fill(replacementPassword);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);
});

test("login cannot place credentials in URLs when application scripts fail", async ({
  browser,
}) => {
  const context = await browser.newContext();

  try {
    const blockedScriptCount = await blockApplicationScripts(context);
    const page = await context.newPage();
    const authenticationRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/auth/sign-in/email") {
        authenticationRequests.push(request.url());
      }
    });

    await page.goto("/login");
    await page.getByLabel("E-post").fill(nativeFallbackEmail);
    await page.getByLabel("Lösenord").fill(nativeFallbackCurrentPassword);
    await expectNativePostWithoutCredentialHistory({
      page,
      pathname: "/login",
      buttonName: "Logga in",
      canaries: [nativeFallbackEmail, nativeFallbackCurrentPassword],
    });

    expect(blockedScriptCount()).toBeGreaterThan(0);
    expect(authenticationRequests).toEqual([]);
    await expect(page.getByRole("heading", { name: "Logga in" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("forced password change cannot place passwords in URLs when application scripts fail", async ({
  browser,
}) => {
  const fallbackIpAddress = "192.0.2.126";
  fixtureRateLimitKeys.add(`${fallbackIpAddress}|/sign-in/email`);
  const userId = await createFixtureUser({
    email: nativeFallbackEmail,
    password: nativeFallbackCurrentPassword,
    mustChangePassword: true,
    temporaryCredentialExpiresAt: new Date("2099-01-01T00:00:00Z"),
  });
  const setupContext = await browser.newContext({
    extraHTTPHeaders: { "x-real-ip": fallbackIpAddress },
  });

  let storageState: Awaited<ReturnType<typeof setupContext.storageState>>;
  try {
    const setupPage = await setupContext.newPage();
    await setupPage.goto("/login");
    await setupPage.getByLabel("E-post").fill(nativeFallbackEmail);
    await setupPage.getByLabel("Lösenord").fill(nativeFallbackCurrentPassword);
    await setupPage.getByRole("button", { name: "Logga in" }).click();
    await expect(setupPage).toHaveURL(/\/byt-losenord$/);
    storageState = await setupContext.storageState();
  } finally {
    await setupContext.close();
  }

  const context = await browser.newContext({
    storageState,
    extraHTTPHeaders: { "x-real-ip": fallbackIpAddress },
  });
  try {
    const blockedScriptCount = await blockApplicationScripts(context);
    const page = await context.newPage();
    const passwordChangeRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/kaul/change-password") {
        passwordChangeRequests.push(request.url());
      }
    });

    await page.goto("/byt-losenord");
    await expect(page).toHaveURL(/\/byt-losenord$/);
    await page
      .getByLabel("Nuvarande lösenord")
      .fill(nativeFallbackCurrentPassword);
    await page
      .getByLabel("Nytt lösenord", { exact: true })
      .fill(nativeFallbackNewPassword);
    await page
      .getByLabel("Bekräfta nytt lösenord")
      .fill(nativeFallbackNewPassword);
    await expectNativePostWithoutCredentialHistory({
      page,
      pathname: "/byt-losenord",
      buttonName: "Spara nytt lösenord",
      canaries: [nativeFallbackCurrentPassword, nativeFallbackNewPassword],
    });

    expect(blockedScriptCount()).toBeGreaterThan(0);
    expect(passwordChangeRequests).toEqual([]);
    await expect(
      page.getByRole("heading", { name: "Byt lösenord" }),
    ).toBeVisible();
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { mustChangePassword: true },
      }),
    ).resolves.toEqual({ mustChangePassword: true });
    await expect(
      prisma.auditOperation.count({
        where: { actorUserId: userId, action: "PASSWORD_CHANGED" },
      }),
    ).resolves.toBe(0);
  } finally {
    await context.close();
  }
});

test("denies expired and banned credentials with the same generic response", async ({
  page,
  request,
}) => {
  const expiredEmail = "slice4.expired@example.test";
  const bannedEmail = "slice4.banned@example.test";
  const unknownEmail = "slice4.unknown@example.test";
  const expiredUserId = await createFixtureUser({
    email: expiredEmail,
    password: temporaryPassword,
    mustChangePassword: true,
    temporaryCredentialExpiresAt: new Date("2020-01-01T00:00:00Z"),
  });
  await createFixtureUser({
    email: bannedEmail,
    password: temporaryPassword,
    banned: true,
    mustChangePassword: false,
    temporaryCredentialExpiresAt: null,
  });

  const attempts = [
    [unknownEmail, temporaryPassword, "192.0.2.122"],
    [expiredEmail, temporaryPassword, "192.0.2.123"],
    [bannedEmail, temporaryPassword, "192.0.2.124"],
    [administratorEmail, "Fictional wrong password 2030", "192.0.2.125"],
  ] as const;
  const results = [];

  for (const [email, password, ipAddress] of attempts) {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: Object.fromEntries(headersFor(ipAddress)),
      data: { email, password, rememberMe: false },
    });
    results.push({
      status: response.status(),
      body: await response.text(),
      setCookie: response.headers()["set-cookie"],
    });
  }

  expect(results.map(({ status }) => status)).toEqual([401, 401, 401, 401]);
  expect(new Set(results.map(({ body }) => body)).size).toBe(1);
  expect(results.every(({ setCookie }) => setCookie === undefined)).toBe(true);
  await expect(
    prisma.session.count({ where: { userId: expiredUserId } }),
  ).resolves.toBe(0);

  await page.goto("/login");
  await page.getByLabel("E-post").fill(expiredEmail);
  await page.getByLabel("Lösenord").fill(temporaryPassword);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText(/Det gick inte att logga in\. Kontrollera uppgifterna/),
  ).toBeVisible();
});

test("blocks password change after an existing temporary session expires", async ({
  page,
}) => {
  const email = "slice4.aged-session@example.test";
  const userId = await createFixtureUser({
    email,
    password: temporaryPassword,
    mustChangePassword: true,
    temporaryCredentialExpiresAt: new Date("2099-01-01T00:00:00Z"),
  });

  await page.goto("/login");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord").fill(temporaryPassword);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).toHaveURL(/\/byt-losenord$/);

  await prisma.user.update({
    where: { id: userId },
    data: { temporaryCredentialExpiresAt: new Date("2020-01-01T00:00:00Z") },
  });
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Inloggningen behöver återställas" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nytt lösenord", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Logga ut" })).toBeVisible();
});
