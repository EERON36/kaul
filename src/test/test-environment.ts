const TEST_ID_PATTERN = /^[a-z][a-z0-9_]{0,40}$/;
const TEST_DATABASE_PREFIX = "kaul_test_";
const LOCAL_POSTGRES_HOSTS = new Set(["127.0.0.1", "localhost"]);
const MINIMUM_TEST_PORT = 3101;
const MAXIMUM_TEST_PORT = 3199;

type TestEnvironmentValues = Record<string, string | undefined>;

export type TestEnvironment = {
  databaseName: string;
  databaseUrl: string;
  integrationDatabaseUrl: string;
  origin: string;
  port: number;
  testId: string;
};

type TestDatabaseTarget = {
  databaseName: string;
  hostname: string;
  port: string;
  protocol: string;
};

function requiredEnvironmentValue(
  values: TestEnvironmentValues,
  name: string,
): string {
  const value = values[name];

  if (!value) {
    throw new Error(`${name} is required for database-writing tests.`);
  }

  return value;
}

export function getTestDatabaseName(testId: string): string {
  if (
    !TEST_ID_PATTERN.test(testId) ||
    testId === "kaul" ||
    testId === "postgres"
  ) {
    throw new Error(
      "KAUL_TEST_ID must use [a-z][a-z0-9_]{0,40} and must not be kaul or postgres.",
    );
  }

  return `${TEST_DATABASE_PREFIX}${testId}`;
}

export function getTestPort(portValue: string | undefined): number {
  if (!portValue || !/^[0-9]+$/.test(portValue)) {
    throw new Error(
      `KAUL_TEST_PORT must be an integer from ${MINIMUM_TEST_PORT} to ${MAXIMUM_TEST_PORT}.`,
    );
  }

  const port = Number(portValue);

  if (
    !Number.isSafeInteger(port) ||
    port < MINIMUM_TEST_PORT ||
    port > MAXIMUM_TEST_PORT
  ) {
    throw new Error(
      `KAUL_TEST_PORT must be an integer from ${MINIMUM_TEST_PORT} to ${MAXIMUM_TEST_PORT}.`,
    );
  }

  return port;
}

export function validateTestDatabaseUrl(
  databaseUrl: string,
  databaseName: string,
  variableName: string,
): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error(`${variableName} must be a valid local PostgreSQL URL.`);
  }

  if (
    (parsedUrl.protocol !== "postgresql:" &&
      parsedUrl.protocol !== "postgres:") ||
    !LOCAL_POSTGRES_HOSTS.has(parsedUrl.hostname) ||
    parsedUrl.pathname !== `/${databaseName}` ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      `${variableName} must target the derived local test database "${databaseName}".`,
    );
  }

  if (!parsedUrl.port) {
    parsedUrl.port = "5432";
  }

  return parsedUrl.toString();
}

function getTestDatabaseTarget(databaseUrl: string): TestDatabaseTarget {
  const parsedUrl = new URL(databaseUrl);

  return {
    databaseName: parsedUrl.pathname.slice(1),
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || "5432",
    protocol: parsedUrl.protocol,
  };
}

function validateMatchingTestDatabaseTargets(
  databaseUrl: string,
  integrationDatabaseUrl: string,
): void {
  const databaseTarget = getTestDatabaseTarget(databaseUrl);
  const integrationDatabaseTarget = getTestDatabaseTarget(
    integrationDatabaseUrl,
  );

  if (
    databaseTarget.protocol !== integrationDatabaseTarget.protocol ||
    databaseTarget.hostname !== integrationDatabaseTarget.hostname ||
    databaseTarget.port !== integrationDatabaseTarget.port ||
    databaseTarget.databaseName !== integrationDatabaseTarget.databaseName
  ) {
    throw new Error(
      "DATABASE_URL and INTEGRATION_DATABASE_URL must target the same local PostgreSQL database.",
    );
  }
}

function validateTestOrigin(origin: string, port: number): string {
  const expectedOrigin = `http://127.0.0.1:${port}`;

  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error(`BETTER_AUTH_URL must equal ${expectedOrigin} for tests.`);
  }

  if (
    parsedOrigin.origin !== expectedOrigin ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    throw new Error(`BETTER_AUTH_URL must equal ${expectedOrigin} for tests.`);
  }

  return expectedOrigin;
}

export function getTestEnvironment(
  values: TestEnvironmentValues = process.env,
): TestEnvironment {
  const testId = requiredEnvironmentValue(values, "KAUL_TEST_ID");
  const databaseName = getTestDatabaseName(testId);
  const port = getTestPort(values.KAUL_TEST_PORT);
  const databaseUrl = validateTestDatabaseUrl(
    requiredEnvironmentValue(values, "DATABASE_URL"),
    databaseName,
    "DATABASE_URL",
  );
  const integrationDatabaseUrl = validateTestDatabaseUrl(
    requiredEnvironmentValue(values, "INTEGRATION_DATABASE_URL"),
    databaseName,
    "INTEGRATION_DATABASE_URL",
  );
  validateMatchingTestDatabaseTargets(databaseUrl, integrationDatabaseUrl);
  const origin = validateTestOrigin(
    requiredEnvironmentValue(values, "BETTER_AUTH_URL"),
    port,
  );

  return {
    databaseName,
    databaseUrl,
    integrationDatabaseUrl,
    origin,
    port,
    testId,
  };
}

export function getTestDatabaseAdminUrl(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);

  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error(
      "Refusing to derive a PostgreSQL administration URL with query parameters or a fragment.",
    );
  }

  parsedUrl.pathname = "/postgres";
  return parsedUrl.toString();
}
