import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { getTestEnvironment } from "./src/test/test-environment";

const testEnvironment = getTestEnvironment();
const betterAuthSecret =
  process.env.BETTER_AUTH_SECRET ??
  "fictional-playwright-secret-at-least-32-characters";
const documentStorageRoot =
  process.env.DOCUMENT_STORAGE_ROOT ??
  resolve(tmpdir(), `kaul-documents-e2e-${testEnvironment.testId}`);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: testEnvironment.origin,
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
    command: `npm run dev -- --hostname 127.0.0.1 --port ${testEnvironment.port}`,
    url: testEnvironment.origin,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testEnvironment.databaseUrl,
      INTEGRATION_DATABASE_URL: testEnvironment.integrationDatabaseUrl,
      KAUL_TEST_ID: testEnvironment.testId,
      KAUL_TEST_PORT: String(testEnvironment.port),
      DEPLOYMENT_ENV: "test",
      BETTER_AUTH_SECRET: betterAuthSecret,
      BETTER_AUTH_URL: testEnvironment.origin,
      DOCUMENT_STORAGE_ROOT: documentStorageRoot,
      DOCUMENT_SCANNER_HOST: process.env.DOCUMENT_SCANNER_HOST ?? "127.0.0.1",
      DOCUMENT_SCANNER_PORT: process.env.DOCUMENT_SCANNER_PORT ?? "3310",
      DOCUMENT_SCANNER_TIMEOUT_MS:
        process.env.DOCUMENT_SCANNER_TIMEOUT_MS ?? "15000",
      DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS:
        process.env.DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS ?? "24",
    },
  },
});
