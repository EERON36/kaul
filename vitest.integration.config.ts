import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { getTestEnvironment } from "./src/test/test-environment";

const testEnvironment = getTestEnvironment();

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    env: {
      DATABASE_URL: testEnvironment.databaseUrl,
      INTEGRATION_DATABASE_URL: testEnvironment.integrationDatabaseUrl,
      KAUL_TEST_ID: testEnvironment.testId,
      KAUL_TEST_PORT: String(testEnvironment.port),
      DEPLOYMENT_ENV: "test",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "fictional-integration-secret-at-least-32-characters",
      BETTER_AUTH_URL: testEnvironment.origin,
      KAUL_PERSONNUMMER_KEYRING_FILE:
        process.env.KAUL_PERSONNUMMER_KEYRING_FILE ??
        fileURLToPath(
          new URL("./test-fixtures/personnummer-keyring.json", import.meta.url),
        ),
    },
    fileParallelism: false,
    include: ["src/**/*.integration.test.ts"],
  },
});
