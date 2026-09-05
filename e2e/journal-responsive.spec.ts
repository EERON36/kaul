import { randomUUID } from "node:crypto";

import { expect, test, type Page, type TestInfo } from "@playwright/test";
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
const organisationId = randomUUID();
const email = `journal.reflow.${organisationId}@example.test`;
const password = "Fictional Journal reflow password 2032";
const ipAddress = "192.0.2.229";
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 900 },
];
let clients: { id: string }[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await prisma.organisation.create({
    data: { id: organisationId, name: "Fiktiv Journal reflow-organisation" },
  });
  await createAuthentication(prisma).api.createUser({
    body: {
      name: "Fiktiv Journalförfattare",
      email,
      password,
      role: UserRole.STAFF_MEMBER,
      data: {
        organisationId,
        professionalTitle: "Fiktiv behandlare",
        mustChangePassword: false,
        temporaryCredentialExpiresAt: null,
      },
    },
  });
  const author = await prisma.user.findUniqueOrThrow({ where: { email } });
  clients = await Promise.all(
    viewports.map(({ width }) =>
      prisma.client.create({
        data: {
          id: randomUUID(),
          organisationId,
          firstName: "Fiktiv",
          lastName: "Mobilklient",
          personIdentifier: `JOURNAL-REFLOW-${width}`,
          category: "ADULT",
          status: "ACTIVE",
          assignments: {
            create: {
              id: randomUUID(),
              staffUserId: author.id,
              responsibility: "PRIMARY",
              createdByUserId: author.id,
            },
          },
        },
        select: { id: true },
      }),
    ),
  );
});

test.afterAll(async () => {
  // This suite creates only drafts. Immutable-record triggers stay enabled.
  await prisma.journalEntry.deleteMany({ where: { organisationId } });
  await prisma.assignment.deleteMany({ where: { organisationId } });
  await prisma.client.deleteMany({ where: { organisationId } });
  await prisma.session.deleteMany({ where: { user: { organisationId } } });
  await prisma.account.deleteMany({ where: { user: { organisationId } } });
  await prisma.user.deleteMany({ where: { organisationId } });
  await prisma.organisation.deleteMany({ where: { id: organisationId } });
  await prisma.rateLimit.deleteMany({
    where: { key: `${ipAddress}|/sign-in/email` },
  });
  await prisma.$disconnect();
});

async function expectContainedControls(
  page: Page,
  testInfo: TestInfo,
  evidenceLabel: string,
) {
  const fields = page.getByRole("group", { name: "Händelsetid" });
  for (const label of ["Datum för händelsen", "Tid för händelsen"]) {
    const input = page.getByLabel(label);
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeInViewport();
    await input.click();
    await expect(input).toBeFocused();
    const fieldBounds = await fields.boundingBox();
    const inputBounds = await input.boundingBox();
    expect(fieldBounds).not.toBeNull();
    expect(inputBounds).not.toBeNull();
    expect(inputBounds!.x).toBeGreaterThanOrEqual(fieldBounds!.x);
    expect(inputBounds!.x + inputBounds!.width).toBeLessThanOrEqual(
      fieldBounds!.x + fieldBounds!.width,
    );
    expect(inputBounds!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  // Native date/time segments are browser UI: retain visible picker/text evidence
  // as well as geometry, so a contained input with clipped content is reviewable.
  const screenshotPath = testInfo.outputPath(
    `event-date-time-${evidenceLabel}.png`,
  );
  await fields.screenshot({ path: screenshotPath });
  await testInfo.attach(`event-date-time-${evidenceLabel}`, {
    path: screenshotPath,
    contentType: "image/png",
  });
}

for (const [index, viewport] of viewports.entries()) {
  test(`Journal event controls remain usable at ${viewport.width} pixels`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.setExtraHTTPHeaders({ "x-real-ip": ipAddress });
    await page.goto("/login");
    await page.getByLabel("E-post").fill(email);
    await page.getByLabel("Lösenord").fill(password);
    await page.getByRole("button", { name: "Logga in" }).click();
    await expect(page).toHaveURL(`${testEnvironment.origin}/`);
    await page.goto(`/klienter/${clients[index].id}/anteckningar/utkast`);
    const content = page.getByLabel("Övrigt", { exact: true });
    await expect
      .poll(() =>
        content.evaluate((element) =>
          Object.prototype.hasOwnProperty.call(element, "value"),
        ),
      )
      .toBe(true);
    await page.evaluate(() => document.fonts.ready);

    for (const textScale of viewport.width < 768 ? [100, 200] : [100]) {
      await page.evaluate((scale) => {
        document.documentElement.style.fontSize = `${scale}%`;
      }, textScale);
      await expectContainedControls(page, testInfo, `${textScale}-before-save`);
      const date = page.getByLabel("Datum för händelsen");
      const time = page.getByLabel("Tid för händelsen");
      if (viewport.width === 1280) {
        const dateBounds = await date.boundingBox();
        const timeBounds = await time.boundingBox();
        expect(dateBounds!.y).toBe(timeBounds!.y);
        expect(timeBounds!.x).toBeGreaterThan(dateBounds!.x);
      }
      await date.fill("2026-08-12");
      await time.fill("08:15");
      const draftContent = `Fiktiv anteckning vid ${textScale} procent text.`;
      await content.fill(draftContent);
      await page.getByRole("button", { name: "Spara utkast" }).click();
      await expect
        .poll(async () => {
          const saved = await prisma.journalEntry.findFirst({
            where: { organisationId, clientId: clients[index].id },
            select: { otherContent: true },
          });
          return saved?.otherContent;
        })
        .toBe(draftContent);
      await expect(page.getByText("Utkastet har sparats.")).toBeVisible();
      await expect(date).toHaveValue("2026-08-12");
      await expect(time).toHaveValue("08:15");
      await expectContainedControls(page, testInfo, `${textScale}-saved`);
    }
    await page.getByRole("button", { name: "Granska inför signering" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Anteckning", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("När du signerar kan anteckningen inte längre ändras.", {
        exact: false,
      }),
    ).toBeVisible();
    const draft = await prisma.journalEntry.findFirstOrThrow({
      where: { organisationId, clientId: clients[index].id },
      select: { eventOccurredAt: true, status: true },
    });
    expect(draft.status).toBe("DRAFT");
    expect(draft.eventOccurredAt.toISOString()).toBe(
      "2026-08-12T06:15:00.000Z",
    );
  });
}
