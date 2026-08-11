import { describe, expect, it, vi } from "vitest";

import {
  createTestDatabase,
  dropTestDatabase,
  getMigrationEnvironment,
  listTestDatabases,
  type TestDatabaseAdmin,
} from "./test-database-lifecycle";
import { getTestEnvironment } from "./test-environment";

function testEnvironment(testId: string) {
  return getTestEnvironment({
    KAUL_TEST_ID: testId,
    KAUL_TEST_PORT: testId === "parallel_a" ? "3111" : "3112",
    DATABASE_URL: `postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_${testId}`,
    INTEGRATION_DATABASE_URL: `postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_${testId}`,
    BETTER_AUTH_URL: `http://127.0.0.1:${testId === "parallel_a" ? "3111" : "3112"}`,
  });
}

function databaseAdmin(existingDatabases: Set<string>): TestDatabaseAdmin {
  return {
    createDatabase: vi.fn(async (databaseName: string) => {
      existingDatabases.add(databaseName);
    }),
    databaseExists: vi.fn(async (databaseName: string) =>
      existingDatabases.has(databaseName),
    ),
    dropDatabase: vi.fn(async (databaseName: string) => {
      existingDatabases.delete(databaseName);
    }),
    listTestDatabases: vi.fn(async () => [...existingDatabases].sort()),
  };
}

describe("test database lifecycle", () => {
  it("passes both database URLs and the derived origin to Prisma migration", () => {
    const environment = testEnvironment("parallel_a");

    expect(getMigrationEnvironment(environment)).toMatchObject({
      DATABASE_URL:
        "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_parallel_a",
      INTEGRATION_DATABASE_URL:
        "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_parallel_a",
      BETTER_AUTH_URL: "http://127.0.0.1:3111",
      KAUL_TEST_ID: "parallel_a",
      KAUL_TEST_PORT: "3111",
    });
  });

  it("creates exactly the derived database and refuses reuse", async () => {
    const databases = new Set<string>();
    const database = databaseAdmin(databases);
    const environment = testEnvironment("parallel_a");

    await createTestDatabase(environment, database);

    expect(database.createDatabase).toHaveBeenCalledWith(
      "kaul_test_parallel_a",
    );
    await expect(createTestDatabase(environment, database)).rejects.toThrow(
      "Refusing to reuse",
    );
  });

  it("drops only the current task database and cannot affect another task", async () => {
    const databases = new Set([
      "kaul",
      "kaul_test_parallel_a",
      "kaul_test_parallel_b",
    ]);
    const database = databaseAdmin(databases);

    await dropTestDatabase(testEnvironment("parallel_a"), database);

    expect(databases).toEqual(new Set(["kaul", "kaul_test_parallel_b"]));
    expect(database.dropDatabase).toHaveBeenCalledWith("kaul_test_parallel_a");
  });

  it("refuses to drop a task database that does not exist", async () => {
    await expect(
      dropTestDatabase(testEnvironment("parallel_a"), databaseAdmin(new Set())),
    ).rejects.toThrow("Refusing to drop unknown");
  });

  it("lists databases without mutating them", async () => {
    const databases = new Set(["kaul_test_parallel_b", "kaul_test_parallel_a"]);
    const database = databaseAdmin(databases);

    await expect(listTestDatabases(database)).resolves.toEqual([
      "kaul_test_parallel_a",
      "kaul_test_parallel_b",
    ]);
    expect(databases).toEqual(
      new Set(["kaul_test_parallel_b", "kaul_test_parallel_a"]),
    );
    expect(database.createDatabase).not.toHaveBeenCalled();
    expect(database.dropDatabase).not.toHaveBeenCalled();
  });
});
