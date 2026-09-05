import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  expect,
  test,
  type Page,
  type Response,
  type TestInfo,
} from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  AssignmentResponsibility,
  ClientStatus,
  PrismaClient,
  UserRole,
} from "../src/generated/prisma/client";
import { createAuthentication } from "../src/modules/authentication/auth";
import {
  replaceDiagnosticFileAtomically,
  sanitizeDocumentUploadDiagnostic,
} from "../src/test/document-upload-diagnostic";
import { getTestEnvironment } from "../src/test/test-environment";

const testEnvironment = getTestEnvironment();
const documentStorageRoot =
  process.env.DOCUMENT_STORAGE_ROOT ??
  resolve(tmpdir(), `kaul-documents-e2e-${testEnvironment.testId}`);
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: testEnvironment.integrationDatabaseUrl,
  }),
});
const authentication = createAuthentication(prisma);
const email = "documents.e2e.administrator@example.test";
const password = "Fictional Documents E2E password 2032";
const staffEmail = "documents.e2e.staff@example.test";
const staffPassword = "Fictional Documents Staff password 2032";
const unassignedEmail = "documents.e2e.unassigned@example.test";
const unassignedPassword = "Fictional Documents Unassigned password 2032";
const organisationName = "Fiktiva Dokumentorganisationen";
let clientId = "";

type UploadDiagnosticObservation = Readonly<{
  stage: "initial-upload" | "version-upload";
  attempt: number;
  httpStatus: number | null;
  applicationCode: string;
}>;

async function writeUploadDiagnostic(
  testInfo: TestInfo,
  observations: readonly UploadDiagnosticObservation[],
) {
  const diagnosticDirectory = resolve(process.cwd(), "test-results");
  await mkdir(diagnosticDirectory, { recursive: true });
  await replaceDiagnosticFileAtomically(
    resolve(
      diagnosticDirectory,
      `kaul-205-documents-upload-diagnostic-attempt-${testInfo.retry + 1}.json`,
    ),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        ticket: "KAUL-205",
        observations,
      },
      null,
      2,
    )}\n`,
  );
}

async function captureUploadResponse(
  page: Page,
  testInfo: TestInfo,
  stage: UploadDiagnosticObservation["stage"],
  endpointPath: string,
  action: () => Promise<void>,
  observations: UploadDiagnosticObservation[],
): Promise<Response> {
  let response: Response;
  try {
    [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.request().method() === "POST" &&
          new URL(candidate.url()).pathname === endpointPath,
      ),
      action(),
    ]);
  } catch (error) {
    observations.push({
      stage,
      attempt: testInfo.retry + 1,
      ...sanitizeDocumentUploadDiagnostic(null, null),
    });
    try {
      await writeUploadDiagnostic(testInfo, observations);
    } catch {
      // Diagnostics must not replace the original browser/request failure.
    }
    throw error;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON response is represented by the stable fallback code below.
  }

  observations.push({
    stage,
    attempt: testInfo.retry + 1,
    ...sanitizeDocumentUploadDiagnostic(response.status(), payload),
  });
  await writeUploadDiagnostic(testInfo, observations);
  return response;
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [email, staffEmail, unassignedEmail] } },
    select: { id: true, organisationId: true },
  });
  const userIds = users.map(({ id }) => id);
  const organisationIds = [
    ...new Set(users.map(({ organisationId }) => organisationId)),
  ];
  if (organisationIds.length > 0) {
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "document" DISABLE TRIGGER USER',
      );
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "documentVersion" DISABLE TRIGGER USER',
      );
      try {
        await transaction.documentVersion.deleteMany({
          where: { organisationId: { in: organisationIds } },
        });
      } finally {
        await transaction.$executeRawUnsafe(
          'ALTER TABLE "documentVersion" ENABLE TRIGGER USER',
        );
      }
      await transaction.document.deleteMany({
        where: { organisationId: { in: organisationIds } },
      });
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "document" ENABLE TRIGGER USER',
      );
      await transaction.assignment.deleteMany({
        where: { organisationId: { in: organisationIds } },
      });
      await transaction.client.deleteMany({
        where: { organisationId: { in: organisationIds } },
      });
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
  await rm(documentStorageRoot, { recursive: true, force: true });
}

async function logIn(page: Page, userEmail = email, userPassword = password) {
  await page.setExtraHTTPHeaders({ "x-real-ip": "192.0.2.244" });
  await page.goto("/login");
  await page.getByLabel("E-post").fill(userEmail);
  await page.getByLabel("Lösenord").fill(userPassword);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).toHaveURL(`${testEnvironment.origin}/`);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanup();
  const organisationId = randomUUID();
  await prisma.organisation.create({
    data: { id: organisationId, name: organisationName },
  });
  await authentication.api.createUser({
    body: {
      name: "Fiktiv Dokumentadministratör",
      email,
      password,
      role: UserRole.ADMINISTRATOR,
      data: {
        organisationId,
        professionalTitle: "Fiktiv verksamhetsansvarig",
        mustChangePassword: false,
        temporaryCredentialExpiresAt: null,
      },
    },
  });
  await authentication.api.createUser({
    body: {
      name: "Fiktiv Dokumentpersonal",
      email: staffEmail,
      password: staffPassword,
      role: UserRole.STAFF_MEMBER,
      data: {
        organisationId,
        professionalTitle: "Fiktiv behandlare",
        mustChangePassword: false,
        temporaryCredentialExpiresAt: null,
      },
    },
  });
  await authentication.api.createUser({
    body: {
      name: "Fiktiv Obehörig Dokumentpersonal",
      email: unassignedEmail,
      password: unassignedPassword,
      role: UserRole.STAFF_MEMBER,
      data: {
        organisationId,
        professionalTitle: "Fiktiv behandlare",
        mustChangePassword: false,
        temporaryCredentialExpiresAt: null,
      },
    },
  });
  clientId = randomUUID();
  await prisma.client.create({
    data: {
      id: clientId,
      organisationId,
      firstName: "Fiktiv",
      lastName: "Dokumentklient",
      personIdentifier: `DOC-E2E-${randomUUID()}`,
      category: "ADULT",
      status: ClientStatus.ACTIVE,
    },
  });
  const [administrator, staff] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email } }),
    prisma.user.findUniqueOrThrow({ where: { email: staffEmail } }),
  ]);
  await prisma.assignment.create({
    data: {
      id: randomUUID(),
      organisationId,
      clientId,
      staffUserId: staff.id,
      responsibility: AssignmentResponsibility.PRIMARY,
      createdByUserId: administrator.id,
    },
  });
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("upload, history, download, keyboard navigation, reflow, and archived read-only state", async ({
  browser,
  page,
}, testInfo) => {
  const uploadDiagnostics: UploadDiagnosticObservation[] = [];
  await logIn(page);
  await page.goto(`/klienter/${clientId}`);
  await page.getByRole("link", { name: "Dokument", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dokument", exact: true }),
  ).toBeVisible();
  const uploadLink = page.getByRole("link", { name: "Ladda upp dokument" });
  await uploadLink.focus();
  await expect(uploadLink).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByLabel("Titel").fill("Fiktivt underlag");
  await page.getByLabel("Beskrivning (valfri)").fill("Fiktiv beskrivning");
  await page.getByLabel("Fil").setInputFiles({
    name: "inte-tillatet.html",
    mimeType: "text/html",
    buffer: Buffer.from("<p>Fiktivt</p>", "utf8"),
  });
  await page.getByRole("button", { name: "Ladda upp dokument" }).click();
  await expect(
    page.getByText("Filformatet stöds inte.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Fil").setInputFiles({
    name: "fiktivt-åäö.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Fiktivt dokument åäö\n", "utf8"),
  });
  const initialUploadResponse = await captureUploadResponse(
    page,
    testInfo,
    "initial-upload",
    `/api/kaul/clients/${clientId}/documents`,
    () => page.getByRole("button", { name: "Ladda upp dokument" }).click(),
    uploadDiagnostics,
  );
  expect(
    initialUploadResponse.status(),
    "Initial upload must return HTTP 201; inspect the bounded KAUL-205 diagnostic artifact.",
  ).toBe(201);
  await expect(
    page.getByText("Dokumentet har laddats upp.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Versionshistorik" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version 1" })).toBeVisible();

  await page.getByLabel("Fil").setInputFiles({
    name: "fiktivt-version-2.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Fiktivt dokument version två\n", "utf8"),
  });
  const documentId = new URL(page.url()).pathname.split("/").at(-1);
  expect(documentId).toBeTruthy();
  const versionUploadResponse = await captureUploadResponse(
    page,
    testInfo,
    "version-upload",
    `/api/kaul/clients/${clientId}/documents/${documentId}/versions`,
    () => page.getByRole("button", { name: "Ladda upp ny version" }).click(),
    uploadDiagnostics,
  );
  expect(
    versionUploadResponse.status(),
    "Version upload must return HTTP 201; inspect the bounded KAUL-205 diagnostic artifact.",
  ).toBe(201);
  await expect(
    page.getByText("Dokumentet har laddats upp.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version 2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version 1" })).toBeVisible();

  const documentPath = new URL(page.url()).pathname;
  const staffContext = await browser.newContext({
    baseURL: testEnvironment.origin,
  });
  const staffPage = await staffContext.newPage();
  await logIn(staffPage, staffEmail, staffPassword);
  await staffPage.goto(documentPath);
  await expect(
    staffPage.getByRole("heading", { name: "Ladda upp ny version" }),
  ).toBeVisible();
  await expect(
    staffPage.getByRole("button", { name: "Arkivera dokument" }),
  ).toHaveCount(0);
  await staffContext.close();

  const unassignedContext = await browser.newContext({
    baseURL: testEnvironment.origin,
  });
  const unassignedPage = await unassignedContext.newPage();
  await logIn(unassignedPage, unassignedEmail, unassignedPassword);
  const denied = await unassignedPage.goto(`/klienter/${clientId}/dokument`);
  expect(denied?.status()).toBe(404);
  await unassignedContext.close();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Hämta version 2" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("fiktivt-version-2.txt");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await page.goBack();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Versionshistorik" }),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Arkivera dokument" }).click();
  await expect(page.getByText("Dokumentet är arkiverat.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ladda upp ny version" }),
  ).toHaveCount(0);

  await prisma.client.update({
    where: { id: clientId },
    data: { status: ClientStatus.ARCHIVED, archivedAt: new Date() },
  });
  await page.goto(`/klienter/${clientId}/dokument`);
  await expect(page.getByText(/Klienten är arkiverad/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ladda upp dokument" }),
  ).toHaveCount(0);
});
