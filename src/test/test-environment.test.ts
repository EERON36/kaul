import { describe, expect, it } from "vitest";

import {
  getTestDatabaseAdminUrl,
  getTestDatabaseName,
  getTestEnvironment,
  getTestPort,
  validateTestDatabaseUrl,
} from "./test-environment";

function environmentValues(overrides: Record<string, string | undefined> = {}) {
  return {
    KAUL_TEST_ID: "parallel_a",
    KAUL_TEST_PORT: "3111",
    DATABASE_URL:
      "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_parallel_a",
    INTEGRATION_DATABASE_URL:
      "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_parallel_a",
    BETTER_AUTH_URL: "http://127.0.0.1:3111",
    ...overrides,
  };
}

describe("test environment", () => {
  it("derives matching disposable resources for an explicit task", () => {
    expect(getTestEnvironment(environmentValues())).toMatchObject({
      databaseName: "kaul_test_parallel_a",
      origin: "http://127.0.0.1:3111",
      port: 3111,
      testId: "parallel_a",
    });
  });

  it("keeps independent task identifiers and ports separate", () => {
    const first = getTestEnvironment(environmentValues());
    const second = getTestEnvironment(
      environmentValues({
        KAUL_TEST_ID: "parallel_b",
        KAUL_TEST_PORT: "3112",
        DATABASE_URL:
          "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_parallel_b",
        INTEGRATION_DATABASE_URL:
          "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_parallel_b",
        BETTER_AUTH_URL: "http://127.0.0.1:3112",
      }),
    );

    expect(first.databaseName).not.toBe(second.databaseName);
    expect(first.origin).not.toBe(second.origin);
  });

  it.each([
    "",
    "kaul",
    "postgres",
    "Parallel",
    "with-dash",
    "with space",
    "../kaul",
    "test%2fother",
    "a/other",
    "a\\other",
    "1starts_with_number",
    `a${"a".repeat(41)}`,
  ])("rejects invalid test identifier %j", (testId) => {
    expect(() => getTestDatabaseName(testId)).toThrow("KAUL_TEST_ID");
  });

  it("accepts the complete CI environment through the shared validator", () => {
    expect(
      getTestEnvironment({
        KAUL_TEST_ID: "ci",
        KAUL_TEST_PORT: "3101",
        DATABASE_URL:
          "postgresql://kaul:fictional-ci@127.0.0.1:5432/kaul_test_ci",
        INTEGRATION_DATABASE_URL:
          "postgresql://kaul:fictional-ci@127.0.0.1:5432/kaul_test_ci",
        BETTER_AUTH_URL: "http://127.0.0.1:3101",
      }),
    ).toMatchObject({
      databaseName: "kaul_test_ci",
      databaseUrl: "postgresql://kaul:fictional-ci@127.0.0.1:5432/kaul_test_ci",
      integrationDatabaseUrl:
        "postgresql://kaul:fictional-ci@127.0.0.1:5432/kaul_test_ci",
      origin: "http://127.0.0.1:3101",
      port: 3101,
      testId: "ci",
    });
  });

  it.each([undefined, "3100", "3200", "3101.0", "3101 ", "three"])(
    "rejects invalid task port %j",
    (port) => {
      expect(() => getTestPort(port)).toThrow("KAUL_TEST_PORT");
    },
  );

  it("accepts both ends of the approved task port range", () => {
    expect(getTestPort("3101")).toBe(3101);
    expect(getTestPort("3199")).toBe(3199);
  });

  it.each([
    "not a URL",
    "https://127.0.0.1:5432/kaul_test_parallel_a",
    "postgresql://db.example.test:5432/kaul_test_parallel_a",
    "postgresql://127.0.0.1:5432/kaul",
    "postgresql://127.0.0.1:5432/postgres",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_b",
    "postgresql://127.0.0.1:5432/kaul_test_parallel%5fa",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a%2fother",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a?host=remote.example",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a?host=/some/socket",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a?port=5433",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a?sslmode=require",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a?sslcert=/fictional/client.crt",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a?sslkey=/fictional/client.key",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a?sslrootcert=/fictional/root.crt",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a?host=localhost&port=5432",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a#fragment",
    "postgresql://127.0.0.1:5432/kaul_test_parallel_a?host=localhost#fragment",
  ])("rejects unsafe or mismatched database URL %s", (databaseUrl) => {
    expect(() =>
      validateTestDatabaseUrl(
        databaseUrl,
        "kaul_test_parallel_a",
        "DATABASE_URL",
      ),
    ).toThrow("DATABASE_URL");
  });

  it("rejects a mismatched database URL from either test environment variable", () => {
    expect(() =>
      getTestEnvironment(
        environmentValues({
          INTEGRATION_DATABASE_URL:
            "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_parallel_b",
        }),
      ),
    ).toThrow("INTEGRATION_DATABASE_URL");
  });

  it.each([
    {
      name: "different port",
      integrationDatabaseUrl:
        "postgresql://kaul:fictional@127.0.0.1:5433/kaul_test_parallel_a",
    },
    {
      name: "different local hostname",
      integrationDatabaseUrl:
        "postgresql://kaul:fictional@localhost:5432/kaul_test_parallel_a",
    },
    {
      name: "different protocol",
      integrationDatabaseUrl:
        "postgres://kaul:fictional@127.0.0.1:5432/kaul_test_parallel_a",
    },
  ])("rejects database URLs with a $name", ({ integrationDatabaseUrl }) => {
    expect(() =>
      getTestEnvironment(
        environmentValues({ INTEGRATION_DATABASE_URL: integrationDatabaseUrl }),
      ),
    ).toThrow(
      "DATABASE_URL and INTEGRATION_DATABASE_URL must target the same local PostgreSQL database",
    );
  });

  it("accepts equivalent normalized database targets with different credentials", () => {
    const environment = getTestEnvironment(
      environmentValues({
        DATABASE_URL:
          "postgresql://application:fictional@127.0.0.1/kaul_test_parallel_a",
        INTEGRATION_DATABASE_URL:
          "postgresql://integration:different-fictional@127.0.0.1:5432/kaul_test_parallel_a",
      }),
    );

    expect(environment).toMatchObject({
      databaseName: "kaul_test_parallel_a",
      databaseUrl:
        "postgresql://application:fictional@127.0.0.1:5432/kaul_test_parallel_a",
      integrationDatabaseUrl:
        "postgresql://integration:different-fictional@127.0.0.1:5432/kaul_test_parallel_a",
    });
  });

  it("rejects an origin that does not match the explicit task port", () => {
    expect(() =>
      getTestEnvironment(
        environmentValues({ BETTER_AUTH_URL: "http://127.0.0.1:3112" }),
      ),
    ).toThrow("BETTER_AUTH_URL");
  });

  it("derives the PostgreSQL administration URL without changing its host", () => {
    expect(
      getTestDatabaseAdminUrl(
        "postgresql://kaul:fictional@localhost:5432/kaul_test_parallel_a",
      ),
    ).toBe("postgresql://kaul:fictional@localhost:5432/postgres");
  });

  it("refuses to derive an administration URL from an unvalidated override", () => {
    expect(() =>
      getTestDatabaseAdminUrl(
        "postgresql://kaul:fictional@localhost:5432/kaul_test_parallel_a?host=remote.example",
      ),
    ).toThrow("administration URL");
  });
});
