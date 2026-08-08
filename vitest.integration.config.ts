import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

if (!integrationDatabaseUrl) {
  throw new Error(
    "INTEGRATION_DATABASE_URL is required for integration tests.",
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
    `Refusing to run integration tests against database "${databaseName}".`,
  );
}

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
      DATABASE_URL: integrationDatabaseUrl,
      DEPLOYMENT_ENV: "test",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "fictional-integration-secret-at-least-32-characters",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    },
    fileParallelism: false,
    include: ["src/**/*.integration.test.ts"],
  },
});
