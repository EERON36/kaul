import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, describe, expect, it } from "vitest";

const script = readFileSync(new URL("./pilot-ops.sh", import.meta.url), "utf8");
const compose = readFileSync(
  new URL("../compose.pilot.yaml", import.meta.url),
  "utf8",
);
const caddy = readFileSync(
  new URL("../deploy/pilot/Caddyfile", import.meta.url),
  "utf8",
);
const dockerfile = readFileSync(
  new URL("../Dockerfile", import.meta.url),
  "utf8",
);
const dockerignore = readFileSync(
  new URL("../.dockerignore", import.meta.url),
  "utf8",
);
const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/publish-release-image.yml", import.meta.url),
  "utf8",
);
const pilotScriptPath = fileURLToPath(
  new URL("./pilot-ops.sh", import.meta.url),
);
const postgresInitPath = fileURLToPath(
  new URL("../deploy/pilot/postgres-init.sh", import.meta.url),
);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const testTemporaryRoot = join(
  repositoryRoot,
  "tmp",
  `pilot-ops-tests-${process.pid}`,
);

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

afterAll(() => {
  rmSync(testTemporaryRoot, { recursive: true, force: true });
});

function posixShellPath() {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Git\\bin\\bash.exe",
          "C:\\Program Files\\Git\\usr\\bin\\sh.exe",
        ]
      : ["/bin/sh", "/usr/bin/sh"];
  const shellPath = candidates.find((candidate) => existsSync(candidate));

  if (!shellPath) {
    throw new Error("A POSIX shell is required for Pilot operator tests.");
  }

  return shellPath;
}

function toPosixPath(path) {
  if (process.platform !== "win32") return path;

  return path
    .replace(/^([A-Za-z]):\\/, (_, drive) => `/${drive.toLowerCase()}/`)
    .replaceAll("\\", "/");
}

function createTemporaryDirectory() {
  mkdirSync(testTemporaryRoot, { recursive: true });
  const directory = mkdtempSync(join(testTemporaryRoot, "case-"));
  temporaryDirectories.push(directory);
  return directory;
}

function generatedSecret() {
  return randomBytes(24).toString("base64url");
}

function validPilotValues(overrides = {}) {
  const values = {
    COMPOSE_PROJECT_NAME: "kaul-pilot-test",
    KAUL_IMAGE: `ghcr.io/example/kaul@sha256:${"a".repeat(64)}`,
    PILOT_HOSTNAME: "pilot.example.test",
    PILOT_HTTP_BIND: "80",
    PILOT_HTTPS_BIND: "443",
    PILOT_HTTPS_UDP_BIND: "443",
    DEPLOYMENT_ENV: "pilot",
    BETTER_AUTH_URL: "https://pilot.example.test",
    BETTER_AUTH_SECRET: generatedSecret(),
    POSTGRES_ADMIN_USER: "kaul_pilot_admin",
    POSTGRES_ADMIN_PASSWORD: generatedSecret(),
    KAUL_DB_USER: "kaul_pilot_app",
    KAUL_DB_PASSWORD: generatedSecret(),
    KAUL_DB_NAME: "kaul_pilot",
    ...overrides,
  };

  if (!("DATABASE_URL" in overrides)) {
    values.DATABASE_URL = `postgresql://${values.KAUL_DB_USER}:${values.KAUL_DB_PASSWORD}@postgres:5432/${values.KAUL_DB_NAME}`;
  }

  return values;
}

function writeEnvironmentFile(directory, values, omittedKey) {
  const environmentPath = join(directory, "pilot.env");
  const content = Object.entries(values)
    .filter(([key]) => key !== omittedKey)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  writeFileSync(environmentPath, `${content}\n`, { mode: 0o600 });
  return environmentPath;
}

function writeExecutable(directory, name, lines) {
  const executablePath = join(directory, name);
  writeFileSync(executablePath, `${lines.join("\n")}\n`, { mode: 0o700 });
  chmodSync(executablePath, 0o700);
  return executablePath;
}

function childEnvironment(stubDirectory, additions = {}) {
  const environment = { ...process.env };
  const existingPath = environment.PATH ?? environment.Path ?? "";
  delete environment.Path;
  delete environment.path;
  environment.PATH = `${stubDirectory}${delimiter}${existingPath}`;
  return { ...environment, ...additions };
}

function dockerStubLines() {
  return [
    "#!/bin/sh",
    "set -eu",
    'printf \'%s\\n\' "$*" >> "$KAUL_TEST_COMMAND_LOG"',
    'if [ "${1:-}" = inspect ]; then',
    '  case "$*" in',
    '    *".Config.Image"*) printf \'%s\\n\' "ghcr.io/example/kaul@sha256:${KAUL_TEST_CURRENT_DIGEST}" ; exit 0 ;;',
    '    *".State.Health"*) printf \'%s\\n\' "${KAUL_TEST_HEALTH_STATUS:-healthy}" ; exit 0 ;;',
    "  esac",
    "fi",
    'case " $* " in',
    '  *" compose version "*) exit 0 ;;',
    '  *" config --quiet "*) exit 0 ;;',
    "  *\" ps -q kaul \"*) printf '%s\\n' kaul-test-container ; exit 0 ;;",
    "  *\" pg_dump \"*) printf 'fictional custom archive\\n' ; exit 0 ;;",
    '  *" pg_restore --list "*) cat >/dev/null ; exit 0 ;;',
    '  *" npm run db:deploy "*) [ "${KAUL_TEST_FAIL_MIGRATION:-0}" != 1 ] ; exit $? ;;',
    '  *" npm run db:status "*) exit 0 ;;',
    '  *" up -d --no-deps kaul "*) [ "${KAUL_TEST_FAIL_APP_START:-0}" != 1 ] ; exit $? ;;',
    '  *" up -d --no-deps caddy "*) [ "${KAUL_TEST_FAIL_CADDY_START:-0}" != 1 ] ; exit $? ;;',
    "esac",
    "exit 0",
  ];
}

function executePilotCommand(
  command,
  { overrides = {}, omittedKey, stub = {} } = {},
) {
  const directory = createTemporaryDirectory();
  const stubDirectory = join(directory, "bin");
  const backupDirectory = join(directory, "backups");
  const commandLog = join(directory, "docker-commands.log");
  const values = validPilotValues(overrides);
  const environmentPath = writeEnvironmentFile(directory, values, omittedKey);
  mkdirSync(stubDirectory);
  writeFileSync(commandLog, "");
  writeExecutable(stubDirectory, "docker", dockerStubLines());

  const shellArguments = [
    toPosixPath(pilotScriptPath),
    command,
    "--env-file",
    toPosixPath(environmentPath),
  ];
  if (command === "update") {
    mkdirSync(backupDirectory);
    shellArguments.push(
      "--backup-dir",
      relative(repositoryRoot, backupDirectory).replaceAll("\\", "/"),
    );
  }

  const result = spawnSync(posixShellPath(), shellArguments, {
    encoding: "utf8",
    env: childEnvironment(stubDirectory, {
      KAUL_TEST_COMMAND_LOG: toPosixPath(commandLog),
      KAUL_TEST_CURRENT_DIGEST: "b".repeat(64),
      ...stub,
    }),
  });

  return {
    ...result,
    commandLog: readFileSync(commandLog, "utf8").split(/\r?\n/).filter(Boolean),
    values,
  };
}

function executePostgresInit(overrides = {}) {
  const directory = createTemporaryDirectory();
  const stubDirectory = join(directory, "bin");
  mkdirSync(stubDirectory);
  writeExecutable(stubDirectory, "psql", ["#!/bin/sh", "cat >/dev/null"]);
  const values = {
    POSTGRES_USER: "kaul_pilot_admin",
    POSTGRES_PASSWORD: generatedSecret(),
    KAUL_DB_USER: "kaul_pilot_app",
    KAUL_DB_PASSWORD: generatedSecret(),
    KAUL_DB_NAME: "kaul_pilot",
    ...overrides,
  };

  const result = spawnSync(posixShellPath(), [toPosixPath(postgresInitPath)], {
    encoding: "utf8",
    env: childEnvironment(stubDirectory, values),
  });

  return { ...result, values };
}

function outputOf(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function commandPosition(commands, fragment) {
  return commands.findIndex((command) => command.includes(fragment));
}

function dockerfileRunCommandContaining(fragment) {
  const lines = dockerfile.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("RUN ")) continue;

    const instructionLines = [lines[index].slice(4)];
    while (instructionLines.at(-1).trimEnd().endsWith("\\")) {
      index += 1;
      instructionLines.push(lines[index]);
    }

    const command = instructionLines.join("\n").replaceAll("\\\n", " ");
    if (command.includes(fragment)) return command;
  }

  throw new Error(`Dockerfile RUN instruction not found: ${fragment}`);
}

function executeDockerBuildCommands() {
  const directory = createTemporaryDirectory();
  const stubDirectory = join(directory, "bin");
  const commandLog = join(directory, "npm-commands.log");
  mkdirSync(stubDirectory);
  writeFileSync(commandLog, "");
  writeExecutable(stubDirectory, "npm", [
    "#!/bin/sh",
    "set -eu",
    'printf \'%s|%s|%s|%s|%s\\n\' "$*" "$DATABASE_URL" "$DEPLOYMENT_ENV" "$BETTER_AUTH_SECRET" "$BETTER_AUTH_URL" >> "$KAUL_TEST_COMMAND_LOG"',
  ]);

  const result = spawnSync(
    posixShellPath(),
    ["-c", dockerfileRunCommandContaining("npm run prisma:generate")],
    {
      encoding: "utf8",
      env: childEnvironment(stubDirectory, {
        KAUL_TEST_COMMAND_LOG: toPosixPath(commandLog),
      }),
    },
  );

  return {
    ...result,
    commandLog: readFileSync(commandLog, "utf8").split(/\r?\n/).filter(Boolean),
  };
}

describe("Pilot operator safety controls", () => {
  it("requires immutable GHCR digests and never sources the environment file", () => {
    expect(script).toContain("@sha256:[0-9a-f]{64}");
    expect(script).not.toMatch(/(?:^|\n)\s*(?:source|\.)\s+[\"']?\$ENV_FILE/m);
    expect(script).toContain("The environment file is parsed as data");
  });

  it("creates and validates portable PostgreSQL backups", () => {
    expect(script).toContain("--format=custom");
    expect(script).toContain("sha256sum");
    expect(script).toContain("pg_restore --list");
  });

  it("restores only into a new guarded database without destructive clean flags", () => {
    expect(script).toContain(
      "restore_suffix=${RESTORE_DATABASE#kaul_restore_}",
    );
    expect(script).toContain("*[!a-z0-9_]*");
    expect(script).toContain("Restore destination already exists");
    expect(script).not.toContain("pg_restore --clean");
    expect(script).not.toContain("dropdb");
  });

  it("keeps the new application stopped on migration or health failure", () => {
    const updateFunction = script.slice(
      script.indexOf("update_application()"),
      script.indexOf("COMMAND=${1:-}"),
    );
    const stopPosition = updateFunction.indexOf("compose stop kaul");
    const stopCaddyPosition = updateFunction.indexOf("compose stop caddy");
    const migrationPosition = updateFunction.indexOf("run_migrations");
    expect(stopCaddyPosition).toBeGreaterThan(-1);
    expect(stopPosition).toBeGreaterThan(-1);
    expect(stopPosition).toBeGreaterThan(stopCaddyPosition);
    expect(migrationPosition).toBeGreaterThan(stopPosition);
    expect(script).toContain(
      "The new application did not become healthy and was stopped",
    );
  });

  it("exposes only Caddy and overwrites the trusted client IP header", () => {
    const publicPortServices = [
      ...compose.matchAll(
        /^  ([a-z]+):\n([\s\S]*?)(?=^  [a-z]+:|^networks:)/gm,
      ),
    ]
      .filter(([, , block]) => /^    ports:/m.test(block))
      .map((match) => match[1]);
    expect(publicPortServices).toEqual(["caddy"]);
    expect(compose).toContain("internal: true");
    expect(caddy).toContain("header_up X-Real-IP {remote_host}");
    expect(caddy).toContain("header_up -CF-Connecting-IP");
  });

  it("builds a pinned non-root application image without environment files", () => {
    expect(
      dockerfile.match(
        /FROM node:24\.18\.0-bookworm-slim@sha256:[0-9a-f]{64}/g,
      ),
    ).toHaveLength(2);
    expect(dockerfile).toMatch(/USER node\s+\n\s*EXPOSE 3000/);
    expect(dockerfile).toContain("org.opencontainers.image.revision");
    expect(dockerignore).toMatch(/^\.env\*$/m);
    expect(dockerignore).toMatch(/^\*\*\/\.env\*$/m);
    expect(dockerfile).not.toMatch(/COPY\s+.*\.env/i);
    expect(compose).toMatch(/image: caddy:2\.11\.4-alpine@sha256:[0-9a-f]{64}/);
    expect(compose).toMatch(
      /image: postgres:18\.4-bookworm@sha256:[0-9a-f]{64}/,
    );
  });

  it("applies the fictional build environment to Prisma and Next without runtime metadata", () => {
    const result = executeDockerBuildCommands();

    expect(result.status, outputOf(result)).toBe(0);
    expect(result.commandLog).toHaveLength(2);
    expect(result.commandLog.map((entry) => entry.split("|")[0])).toEqual([
      "run prisma:generate",
      "run build",
    ]);

    for (const entry of result.commandLog) {
      const [, databaseUrl, deploymentEnvironment, authSecret, authUrl] =
        entry.split("|");
      expect(databaseUrl).toMatch(/^postgresql:\/\/build:/);
      expect(deploymentEnvironment).toBe("test");
      expect(authSecret.length).toBeGreaterThanOrEqual(32);
      expect(authUrl).toBe("http://127.0.0.1:3000");
    }

    const runtimeStage = dockerfile.slice(dockerfile.lastIndexOf("\nFROM "));
    expect(runtimeStage).not.toMatch(
      /(?:DATABASE_URL|DEPLOYMENT_ENV|BETTER_AUTH_SECRET|BETTER_AUTH_URL)=/,
    );
  });

  it("publishes without deployment permissions or a latest tag", () => {
    expect(releaseWorkflow).toContain("packages: write");
    expect(releaseWorkflow).toContain("contents: read");
    expect(releaseWorkflow).toContain("flavor: latest=false");
    expect(releaseWorkflow).not.toContain("id-token: write");
    expect(releaseWorkflow).not.toMatch(/\bssh\b/i);
    expect(releaseWorkflow).not.toContain("environment: pilot");
  });
});

describe("Pilot preflight behavior", () => {
  it("accepts a fully valid Pilot configuration with generated-length secrets", () => {
    const result = executePilotCommand("preflight");

    expect(result.status, outputOf(result)).toBe(0);
    expect(result.stdout).toContain("Pilot preflight passed");
    expect(
      [
        result.values.BETTER_AUTH_SECRET,
        result.values.POSTGRES_ADMIN_PASSWORD,
        result.values.KAUL_DB_PASSWORD,
      ].some((secret) => outputOf(result).includes(secret)),
    ).toBe(false);
  });

  it.each([
    ["database name", { KAUL_DB_NAME: "kaul-pilot" }, "KAUL_DB_NAME"],
    ["application username", { KAUL_DB_USER: "Kaul_app" }, "KAUL_DB_USER"],
    [
      "administrator username",
      { POSTGRES_ADMIN_USER: "kaul-admin" },
      "POSTGRES_ADMIN_USER",
    ],
  ])("rejects an invalid %s", (_, overrides, expectedKey) => {
    const result = executePilotCommand("preflight", { overrides });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(expectedKey);
  });

  it("rejects malformed database-password input without printing it", () => {
    const malformedPassword = `${"a".repeat(31)}:`;
    const result = executePilotCommand("preflight", {
      overrides: { POSTGRES_ADMIN_PASSWORD: malformedPassword },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("POSTGRES_ADMIN_PASSWORD");
    expect(outputOf(result).includes(malformedPassword)).toBe(false);
  });

  it.each(["kaul", "postgres"])(
    "rejects the %s database target",
    (database) => {
      const result = executePilotCommand("preflight", {
        overrides: { KAUL_DB_NAME: database },
      });

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(
        "Pilot must not use the normal development or system database",
      );
    },
  );

  it("rejects a missing required value", () => {
    const result = executePilotCommand("preflight", {
      omittedKey: "KAUL_DB_USER",
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("KAUL_DB_USER must occur exactly once");
  });

  it.each(["POSTGRES_ADMIN_PASSWORD", "KAUL_DB_PASSWORD"])(
    "rejects a too-short %s without printing it",
    (key) => {
      const shortPassword = "short-generated-secret";
      const result = executePilotCommand("preflight", {
        overrides: { [key]: shortPassword },
      });

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(
        `${key} must contain at least 32 characters`,
      );
      expect(outputOf(result).includes(shortPassword)).toBe(false);
    },
  );
});

describe("Pilot update behavior", () => {
  it("keeps Caddy stopped until a healthy Kaul release passes validation", () => {
    const result = executePilotCommand("update");
    const commands = result.commandLog;

    expect(result.status, outputOf(result)).toBe(0);
    expect(commandPosition(commands, "pg_dump")).toBeLessThan(
      commandPosition(commands, "stop caddy"),
    );
    expect(commandPosition(commands, "stop caddy")).toBeLessThan(
      commandPosition(commands, "stop kaul"),
    );
    expect(commandPosition(commands, "npm run db:deploy")).toBeLessThan(
      commandPosition(commands, "up -d --no-deps kaul"),
    );
    expect(commandPosition(commands, ".State.Health")).toBeLessThan(
      commandPosition(commands, "up -d --no-deps caddy"),
    );
  });

  it("leaves public serving stopped and reports a migration failure", () => {
    const result = executePilotCommand("update", {
      stub: { KAUL_TEST_FAIL_MIGRATION: "1" },
    });

    expect(result.status).not.toBe(0);
    expect(commandPosition(result.commandLog, "stop caddy")).toBeGreaterThan(
      -1,
    );
    expect(commandPosition(result.commandLog, "up -d --no-deps caddy")).toBe(
      -1,
    );
    expect(commandPosition(result.commandLog, "up -d --no-deps kaul")).toBe(-1);
    expect(outputOf(result)).toContain(
      "Migration failed. Kaul remains stopped",
    );
  });

  it("stops an unhealthy Kaul release and leaves Caddy stopped", () => {
    const result = executePilotCommand("update", {
      stub: { KAUL_TEST_HEALTH_STATUS: "unhealthy" },
    });

    expect(result.status).not.toBe(0);
    expect(commandPosition(result.commandLog, ".State.Health")).toBeGreaterThan(
      -1,
    );
    expect(commandPosition(result.commandLog, "up -d --no-deps caddy")).toBe(
      -1,
    );
    expect(
      result.commandLog.filter((command) => command.includes("stop kaul")),
    ).toHaveLength(2);
    expect(outputOf(result)).toContain(
      "The new application did not become healthy and was stopped",
    );
  });

  it("reports an application-start failure and leaves Caddy stopped", () => {
    const result = executePilotCommand("update", {
      stub: { KAUL_TEST_FAIL_APP_START: "1" },
    });

    expect(result.status).not.toBe(0);
    expect(
      commandPosition(result.commandLog, "up -d --no-deps kaul"),
    ).toBeGreaterThan(-1);
    expect(commandPosition(result.commandLog, "up -d --no-deps caddy")).toBe(
      -1,
    );
    expect(outputOf(result)).toContain(
      "Kaul startup failed. Kaul and Caddy remain stopped",
    );
  });

  it("reports when public serving cannot be restored", () => {
    const result = executePilotCommand("update", {
      stub: { KAUL_TEST_FAIL_CADDY_START: "1" },
    });

    expect(result.status).not.toBe(0);
    expect(commandPosition(result.commandLog, ".State.Health")).toBeGreaterThan(
      -1,
    );
    expect(
      commandPosition(result.commandLog, "up -d --no-deps caddy"),
    ).toBeGreaterThan(-1);
    expect(outputOf(result)).toContain(
      "Kaul is healthy, but Caddy failed to start. The Pilot remains unavailable",
    );
  });
});

describe("Pilot PostgreSQL initialization behavior", () => {
  it("accepts generated-length database passwords", () => {
    const result = executePostgresInit();

    expect(result.status).toBe(0);
  });

  it("rejects a short password without printing it", () => {
    const shortPassword = "short-secret";
    const result = executePostgresInit({
      KAUL_DB_PASSWORD: shortPassword,
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "KAUL_DB_PASSWORD must contain at least 32 characters",
    );
    expect(outputOf(result).includes(shortPassword)).toBe(false);
  });

  it("rejects a placeholder password without printing it", () => {
    const placeholderPassword =
      "REPLACE_WITH_AT_LEAST_32_RANDOM_URL_SAFE_CHARACTERS";
    const result = executePostgresInit({
      POSTGRES_PASSWORD: placeholderPassword,
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "POSTGRES_PASSWORD still contains an example or placeholder value",
    );
    expect(outputOf(result).includes(placeholderPassword)).toBe(false);
  });
});
