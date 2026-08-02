import { defineConfig, devices } from "@playwright/test";

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

if (!integrationDatabaseUrl) {
  throw new Error("INTEGRATION_DATABASE_URL is required for Playwright tests.");
}

let parsedDatabaseUrl: URL;

try {
  parsedDatabaseUrl = new URL(integrationDatabaseUrl);
} catch {
  throw new Error(
    "INTEGRATION_DATABASE_URL must be a valid PostgreSQL URL for Playwright tests.",
  );
}

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
    `Refusing to run Playwright tests against database "${databaseName}".`,
  );
}

const betterAuthSecret =
  process.env.BETTER_AUTH_SECRET ??
  "fictional-playwright-secret-at-least-32-characters";
const betterAuthUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: {
      "x-real-ip": "203.0.113.10",
    },
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: integrationDatabaseUrl,
      INTEGRATION_DATABASE_URL: integrationDatabaseUrl,
      DEPLOYMENT_ENV: "test",
      BETTER_AUTH_SECRET: betterAuthSecret,
      BETTER_AUTH_URL: betterAuthUrl,
    },
  },
});
