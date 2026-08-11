import { spawn } from "node:child_process";
import { resolve } from "node:path";

import {
  getTestDatabaseAdminUrl,
  type TestEnvironment,
} from "./test-environment";

export type TestDatabaseAdmin = {
  createDatabase(databaseName: string): Promise<void>;
  databaseExists(databaseName: string): Promise<boolean>;
  dropDatabase(databaseName: string): Promise<void>;
  listTestDatabases(): Promise<string[]>;
};

export async function createTestDatabase(
  environment: TestEnvironment,
  databaseAdmin: TestDatabaseAdmin,
): Promise<void> {
  if (await databaseAdmin.databaseExists(environment.databaseName)) {
    throw new Error(
      `Refusing to reuse existing task database "${environment.databaseName}".`,
    );
  }

  await databaseAdmin.createDatabase(environment.databaseName);
}

export async function dropTestDatabase(
  environment: TestEnvironment,
  databaseAdmin: TestDatabaseAdmin,
): Promise<void> {
  if (!(await databaseAdmin.databaseExists(environment.databaseName))) {
    throw new Error(
      `Refusing to drop unknown task database "${environment.databaseName}".`,
    );
  }

  await databaseAdmin.dropDatabase(environment.databaseName);
}

export async function listTestDatabases(
  databaseAdmin: TestDatabaseAdmin,
): Promise<string[]> {
  return databaseAdmin.listTestDatabases();
}

export function getMigrationEnvironment(
  environment: TestEnvironment,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: environment.databaseUrl,
    INTEGRATION_DATABASE_URL: environment.integrationDatabaseUrl,
    KAUL_TEST_ID: environment.testId,
    KAUL_TEST_PORT: String(environment.port),
    BETTER_AUTH_URL: environment.origin,
  };
}

export async function migrateTestDatabase(
  environment: TestEnvironment,
  runProcess: typeof spawn = spawn,
): Promise<void> {
  await new Promise<void>((resolveMigration, reject) => {
    const prismaCli = resolve(
      process.cwd(),
      "node_modules/prisma/build/index.js",
    );
    const child = runProcess(
      process.execPath,
      [prismaCli, "migrate", "deploy"],
      {
        env: getMigrationEnvironment(environment),
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveMigration();
      } else {
        reject(
          new Error("Prisma migrate deploy failed for the task database."),
        );
      }
    });
  });
}

export function getAdminDatabaseUrl(environment: TestEnvironment): string {
  return getTestDatabaseAdminUrl(environment.databaseUrl);
}
