import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
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
const organisationPrefix = "Fiktiv månadsrapport UI-organisation ";
const administratorEmail = "monthly-report.ui.administrator@example.test";
const authorEmail = "monthly-report.ui.author@example.test";
const peerEmail = "monthly-report.ui.peer@example.test";
const password = "Fictional Monthly Report UI password 2032";
const rateLimitKeys = new Set<string>();

type Fixtures = Awaited<ReturnType<typeof createFixtures>>;
let fixtures: Fixtures;

async function cleanupOrganisations(organisationIds: readonly string[]) {
  if (organisationIds.length === 0) return;
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      'ALTER TABLE "monthlyReport" DISABLE TRIGGER USER',
    );
    try {
      await transaction.monthlyReport.deleteMany({
        where: { organisationId: { in: [...organisationIds] } },
      });
    } finally {
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "monthlyReport" ENABLE TRIGGER USER',
      );
    }
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
      "Fiktiv rapportadministratör",
      administratorEmail,
      UserRole.ADMINISTRATOR,
    ),
    createUser(
      organisationId,
      "Fiktiv rapportförfattare",
      authorEmail,
      UserRole.STAFF_MEMBER,
    ),
    createUser(
      organisationId,
      "Fiktiv rapportkollega",
      peerEmail,
      UserRole.STAFF_MEMBER,
    ),
  ]);
  const client = await prisma.client.create({
    data: {
      id: randomUUID(),
      organisationId,
      firstName: "Fiktiv",
      lastName: "Månadsrapportklient",
      personIdentifier: `MONTHLY-REPORT-UI-${randomUUID()}`,
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
  return { organisationId, administrator, author, peer, client };
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
  browser: Browser,
  email: string,
  ipAddress: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logIn(page, email, ipAddress);
  return { context, page };
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

test("shared monthly report draft can be saved, signed, and replaced", async ({
  browser,
  page,
}) => {
  await logIn(page, authorEmail, "192.0.2.241");
  const reportsPath = `/klienter/${fixtures.client.id}/manadsrapporter`;
  await page.goto(reportsPath);
  await expect(
    page.getByRole("heading", { name: "Månadsrapporter" }),
  ).toBeVisible();
  await page.getByLabel("Månad", { exact: true }).selectOption("8");
  await page.getByLabel("År", { exact: true }).fill("2026");
  await page.getByRole("button", { name: "Öppna månadsrapport" }).click();
  await expect(
    page.getByRole("heading", { name: "Månadsrapport Augusti 2026" }),
  ).toBeVisible();

  const peer = await newSignedInPage(browser, peerEmail, "192.0.2.242");
  try {
    await peer.page.goto(reportsPath);
    const draftLink = peer.page.locator(".journal-history-link", {
      hasText: "Augusti 2026",
    });
    await expect(draftLink).toContainText("Utkast");
    await draftLink.click();
    await expect(peer.page.getByLabel("Hälsa", { exact: true })).toBeVisible();
    await peer.page
      .getByLabel("Övrigt", { exact: true })
      .fill("Fiktiv uppgift från kollega.");
    await peer.page.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(
      peer.page.getByText("Månadsrapporten har sparats."),
    ).toBeVisible();
  } finally {
    await peer.context.close();
  }

  await page.goto(reportsPath);
  await page
    .locator(".journal-history-link", { hasText: "Augusti 2026" })
    .click();
  await expect(page.getByLabel("Övrigt", { exact: true })).toHaveValue(
    "Fiktiv uppgift från kollega.",
  );

  const sectionValues = {
    Hälsa: "Fiktiv hälsouppgift för augusti.",
    "Utbildning/Sysselsättning": "Fiktiv utbildningsuppgift för augusti.",
    "Känslor och Beteende": "Fiktiv uppgift om känslor och beteende.",
    "Sociala relationer": "Fiktiv uppgift om sociala relationer.",
    "ADL/självständighet": "Fiktiv uppgift om ADL och självständighet.",
  } as const;
  for (const [label, value] of Object.entries(sectionValues)) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page.getByRole("button", { name: "Spara", exact: true }).click();
  await expect(page.getByText("Månadsrapporten har sparats.")).toBeVisible();
  await page.reload();
  for (const [label, value] of Object.entries(sectionValues)) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  }
  await expect(page.getByLabel("Övrigt", { exact: true })).toHaveValue(
    "Fiktiv uppgift från kollega.",
  );

  await page.getByRole("button", { name: "Granska inför signering" }).click();
  await expect(
    page.getByRole("heading", { name: "Månadsrapport Augusti 2026" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Signera månadsrapport" }).click();
  await expect(page).toHaveURL(/\/manadsrapporter\/[0-9a-f-]+\?signerad=klar$/);
  await expect(page.getByText("Månadsrapporten har signerats.")).toBeVisible();
  await expect(
    page.getByText("Rapporten är signerad och kan inte ändras."),
  ).toBeVisible();
  for (const label of [...Object.keys(sectionValues), "Övrigt"]) {
    await expect(
      page.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Signera månadsrapport" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Skapa ersättningsrapport" }),
  ).toBeVisible();

  const signedReport = await prisma.monthlyReport.findFirstOrThrow({
    where: {
      clientId: fixtures.client.id,
      calendarYear: 2026,
      calendarMonth: 8,
      status: "SIGNED",
    },
  });
  await page.getByRole("button", { name: "Skapa ersättningsrapport" }).click();
  await expect(page).toHaveURL(/\/manadsrapporter\/utkast\/[0-9a-f-]+$/);
  const replacementId = new URL(page.url()).pathname.split("/").at(-1);
  expect(replacementId).toBeTruthy();
  const replacement = await prisma.monthlyReport.findUniqueOrThrow({
    where: { id: replacementId! },
  });
  expect(replacement).toMatchObject({
    clientId: fixtures.client.id,
    replacesReportId: signedReport.id,
  });
  await expect(
    page.getByRole("heading", { name: "Månadsrapport Augusti 2026" }),
  ).toBeVisible();
  await expect(page.getByText("Detta är en ersättningsrapport.")).toBeVisible();
  await expect(page.getByLabel("Övrigt", { exact: true })).toHaveValue(
    "Fiktiv uppgift från kollega.",
  );
});
