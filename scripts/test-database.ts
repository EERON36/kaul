import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  createTestDatabase,
  dropTestDatabase,
  getAdminDatabaseUrl,
  listTestDatabases,
  migrateTestDatabase,
  type TestDatabaseAdmin,
} from "../src/test/test-database-lifecycle";
import {
  getTestDatabaseName,
  getTestEnvironment,
} from "../src/test/test-environment";

function quoteDerivedDatabaseName(databaseName: string): string {
  const testId = databaseName.slice("kaul_test_".length);

  if (getTestDatabaseName(testId) !== databaseName) {
    throw new Error(
      "Refusing to operate on a database outside the test namespace.",
    );
  }

  return `"${databaseName}"`;
}

function createDatabaseAdmin(databaseUrl: string): TestDatabaseAdmin & {
  disconnect(): Promise<void>;
} {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  return {
    async createDatabase(databaseName) {
      // PostgreSQL does not support parameterising identifiers. This value is
      // derived from the strict test-ID grammar before it reaches this boundary.
      await prisma.$executeRawUnsafe(
        `CREATE DATABASE ${quoteDerivedDatabaseName(databaseName)}`,
      );
    },
    async databaseExists(databaseName) {
      const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"',
        databaseName,
      );
      return result[0]?.exists === true;
    },
    async disconnect() {
      await prisma.$disconnect();
    },
    async dropDatabase(databaseName) {
      // Do not use DROP DATABASE ... WITH (FORCE): another task's connection
      // must never be terminated by this task's explicit cleanup command.
      await prisma.$executeRawUnsafe(
        `DROP DATABASE ${quoteDerivedDatabaseName(databaseName)}`,
      );
    },
    async listTestDatabases() {
      const result = await prisma.$queryRawUnsafe<Array<{ datname: string }>>(
        "SELECT datname FROM pg_database WHERE substring(datname from 1 for 10) = 'kaul_test_' ORDER BY datname",
      );
      return result.map(({ datname }) => datname);
    },
  };
}

export async function runTestDatabaseCommand(command: string | undefined) {
  const environment = getTestEnvironment();

  if (command === "check") {
    process.stdout.write(
      `Validated task ${environment.testId}: ${environment.databaseName} at ${environment.origin}\n`,
    );
    return;
  }

  if (command === "migrate") {
    await migrateTestDatabase(environment);
    return;
  }

  const databaseAdmin = createDatabaseAdmin(getAdminDatabaseUrl(environment));

  try {
    if (command === "create") {
      await createTestDatabase(environment, databaseAdmin);
      process.stdout.write(`Created ${environment.databaseName}.\n`);
      return;
    }

    if (command === "drop") {
      await dropTestDatabase(environment, databaseAdmin);
      process.stdout.write(`Dropped ${environment.databaseName}.\n`);
      return;
    }

    if (command === "list") {
      const databases = await listTestDatabases(databaseAdmin);
      process.stdout.write(
        `${databases.join("\n")}${databases.length ? "\n" : ""}`,
      );
      return;
    }

    throw new Error("Usage: test-database.ts <check|create|migrate|list|drop>");
  } finally {
    await databaseAdmin.disconnect();
  }
}

export function getTestDatabaseCommandErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "55006"
  ) {
    return "Task database cleanup stopped because the database has active connections.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Task database command failed.";
}

const entryPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (entryPath === import.meta.url) {
  void runTestDatabaseCommand(process.argv[2]).catch((error: unknown) => {
    process.stderr.write(`${getTestDatabaseCommandErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
