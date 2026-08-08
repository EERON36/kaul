import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const playwrightBaseUrl = "http://127.0.0.1:3100";

if (!integrationDatabaseUrl) {
  throw new Error(
    "INTEGRATION_DATABASE_URL is required for authentication E2E tests.",
  );
}

const parsedDatabaseUrl = new URL(integrationDatabaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
const isLocalPostgreSql =
  (parsedDatabaseUrl.protocol === "postgresql:" ||
    parsedDatabaseUrl.protocol === "postgres:") &&
  (parsedDatabaseUrl.hostname === "127.0.0.1" ||
    parsedDatabaseUrl.hostname === "localhost");
const isDisposableLocalDatabase = databaseName === "kaul_m1_schema_test";
const isEphemeralCiDatabase =
  process.env.CI === "true" && databaseName === "kaul";

if (
  !isLocalPostgreSql ||
  (!isDisposableLocalDatabase && !isEphemeralCiDatabase)
) {
  throw new Error(
    `Refusing to run authentication E2E tests against database "${databaseName}".`,
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: integrationDatabaseUrl }),
});

test.use({ trace: "off" });

function fictionalHeaders(ipAddress: string) {
  return {
    origin: playwrightBaseUrl,
    "x-real-ip": ipAddress,
  };
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("public email signup is denied without creating records", async ({
  request,
}) => {
  await prisma.rateLimit.deleteMany({
    where: { key: "192.0.2.10|/sign-up/email" },
  });

  const attemptedEmail = "fictional-public-signup@example.test";
  const before = await prisma.user.count({
    where: { email: attemptedEmail },
  });

  const response = await request.post("/api/auth/sign-up/email", {
    headers: fictionalHeaders("192.0.2.10"),
    data: {
      name: "Fiktiv Registrering",
      email: attemptedEmail,
      password: "Fictional-Public-Signup-Password-2026!",
      role: "ADMINISTRATOR",
      organisationId: "org_injected_fictional",
      professionalTitle: "Injicerad titel",
      mustChangePassword: false,
      temporaryCredentialExpiresAt: "2099-01-01T00:00:00.000Z",
    },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
  });
  await expect(
    prisma.user.count({ where: { email: attemptedEmail } }),
  ).resolves.toBe(before);
  await expect(
    prisma.account.count({ where: { user: { email: attemptedEmail } } }),
  ).resolves.toBe(0);
});

test("raw Admin HTTP routes return generic 404 responses", async ({
  request,
}) => {
  const paths = [
    "/api/auth/admin",
    "/api/auth/admin/create-user",
    "/api/auth/admin/set-role",
    "/api/auth/admin/impersonate-user",
    "/api/auth/admin/delete-user",
    "/api/auth/admin/set-user-password",
    "/api/auth/change-password",
    "/api/auth/change-password/",
  ];

  for (const path of paths) {
    const response = await request.post(path, {
      headers: fictionalHeaders("192.0.2.20"),
    });

    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("");
  }
});

test("a normal Better Auth route remains mounted", async ({ request }) => {
  const response = await request.get("/api/auth/get-session", {
    headers: fictionalHeaders("192.0.2.30"),
  });

  expect(response.status()).toBe(200);
  expect(await response.json()).toBeNull();
});

test("sign-in rate limiting is persisted in PostgreSQL", async ({
  request,
}) => {
  const ipAddress = "192.0.2.40";
  const key = `${ipAddress}|/sign-in/email`;

  await prisma.rateLimit.deleteMany({ where: { key } });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: fictionalHeaders(ipAddress),
      data: {
        email: "fictional-rate-limit@example.test",
        password: "Fictional-Rate-Limit-Password-2026!",
      },
    });

    expect(response.status()).not.toBe(429);
  }

  const blockedResponse = await request.post("/api/auth/sign-in/email", {
    headers: fictionalHeaders(ipAddress),
    data: {
      email: "fictional-rate-limit@example.test",
      password: "Fictional-Rate-Limit-Password-2026!",
    },
  });
  const persistedRateLimit = await prisma.rateLimit.findUnique({
    where: { key },
  });

  expect(blockedResponse.status()).toBe(429);
  expect(persistedRateLimit).toMatchObject({ key, count: 5 });
});
