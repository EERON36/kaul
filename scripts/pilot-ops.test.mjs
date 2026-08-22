import { spawn, spawnSync } from "node:child_process";
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
import { tmpdir } from "node:os";
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
const pilotRunbook = readFileSync(
  new URL("../deploy/pilot/README.md", import.meta.url),
  "utf8",
);
const pilotScriptPath = fileURLToPath(
  new URL("./pilot-ops.sh", import.meta.url),
);
const postgresInitPath = fileURLToPath(
  new URL("../deploy/pilot/postgres-init.sh", import.meta.url),
);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const pilotShellScripts = [
  ["scripts/pilot-ops.sh", pilotScriptPath],
  ["deploy/pilot/postgres-init.sh", postgresInitPath],
];
const testTemporaryRoot = join(
  repositoryRoot,
  "tmp",
  `pilot-ops-tests-${process.pid}`,
);

const temporaryDirectories = [];
const operationLockPaths = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  for (const lockPath of operationLockPaths.splice(0)) {
    rmSync(lockPath, { force: true });
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

function uniqueComposeProject(suffix) {
  const project = `kaul-pilot-${suffix}-${randomBytes(6).toString("hex")}`;
  const lockDirectory = process.platform === "win32" ? tmpdir() : "/tmp";
  operationLockPaths.push(
    join(lockDirectory, `kaul-pilot-${project}.pilot-ops.lock`),
  );
  return project;
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
    'case " $* " in',
    '  *" compose --project-name "*)',
    "    for key in COMPOSE_PROJECT_NAME KAUL_IMAGE PILOT_HOSTNAME PILOT_HTTP_BIND PILOT_HTTPS_BIND PILOT_HTTPS_UDP_BIND DEPLOYMENT_ENV BETTER_AUTH_URL BETTER_AUTH_SECRET POSTGRES_ADMIN_USER POSTGRES_ADMIN_PASSWORD KAUL_DB_USER KAUL_DB_PASSWORD KAUL_DB_NAME DATABASE_URL; do",
    '      if printenv "$key" >/dev/null 2>&1; then source=ambient; else source=env-file; fi',
    '      printf \'%s=%s\\n\' "$key" "$source" >> "$KAUL_TEST_INTERPOLATION_LOG"',
    "    done ;;",
    "esac",
    'if [ "${1:-}" = inspect ]; then',
    '  case "$*" in',
    '    *".Config.Image"*) printf \'%s\\n\' "ghcr.io/example/kaul@sha256:${KAUL_TEST_CURRENT_DIGEST}" ; exit 0 ;;',
    '    *".State.Health"*) printf \'%s\\n\' "${KAUL_TEST_HEALTH_STATUS:-healthy}" ; exit 0 ;;',
    "  esac",
    "fi",
    'case " $* " in',
    '  *" compose version "*)',
    '    if [ "${KAUL_TEST_BLOCK_PREFLIGHT:-0}" = 1 ]; then',
    '      : > "$KAUL_TEST_BLOCK_READY"',
    '      while [ ! -f "$KAUL_TEST_BLOCK_RELEASE" ]; do sleep 0.05; done',
    "    fi",
    "    exit 0 ;;",
    '  *" config --quiet "*) exit 0 ;;',
    "  *\" ps -q kaul \"*) printf '%s\\n' kaul-test-container ; exit 0 ;;",
    '  *" stop caddy "*) [ "${KAUL_TEST_FAIL_CADDY_STOP:-0}" != 1 ] ; exit $? ;;',
    '  *" stop kaul "*) [ "${KAUL_TEST_FAIL_KAUL_STOP:-0}" != 1 ] ; exit $? ;;',
    '  *" pg_dump "*) [ "${KAUL_TEST_FAIL_BACKUP:-0}" != 1 ] || exit 1; printf \'fictional custom archive\\n\' ; exit 0 ;;',
    '  *" pg_restore --list "*) cat >/dev/null ; exit 0 ;;',
    '  *" npm run db:deploy "*) [ "${KAUL_TEST_FAIL_MIGRATION:-0}" != 1 ] ; exit $? ;;',
    '  *" npm run db:status "*) exit 0 ;;',
    '  *" up -d --no-deps kaul "*) [ "${KAUL_TEST_FAIL_APP_START:-0}" != 1 ] ; exit $? ;;',
    '  *" up -d --no-deps caddy "*) [ "${KAUL_TEST_FAIL_CADDY_START:-0}" != 1 ] ; exit $? ;;',
    "esac",
    "exit 0",
  ];
}

function createPilotCommandFixture({ overrides = {}, omittedKey } = {}) {
  const directory = createTemporaryDirectory();
  const stubDirectory = join(directory, "bin");
  const backupDirectory = join(directory, "backups");
  const values = validPilotValues(overrides);
  const environmentPath = writeEnvironmentFile(directory, values, omittedKey);
  mkdirSync(stubDirectory);
  writeExecutable(stubDirectory, "docker", dockerStubLines());

  return {
    backupDirectory,
    directory,
    environmentPath,
    stubDirectory,
    values,
  };
}

function preparePilotInvocation(
  command,
  fixture,
  stub = {},
  acquireOperationLock = false,
) {
  const commandLog = join(
    fixture.directory,
    `docker-commands-${randomBytes(6).toString("hex")}.log`,
  );
  const interpolationLog = join(
    fixture.directory,
    `compose-interpolation-${randomBytes(6).toString("hex")}.log`,
  );
  writeFileSync(commandLog, "");
  writeFileSync(interpolationLog, "");

  const operatorArguments = [
    toPosixPath(pilotScriptPath),
    ...(acquireOperationLock
      ? []
      : ["--pilot-operation-lock-held", fixture.values.COMPOSE_PROJECT_NAME]),
    command,
    "--env-file",
    toPosixPath(fixture.environmentPath),
  ];
  if (["backup", "migrate", "update"].includes(command)) {
    mkdirSync(fixture.backupDirectory, { recursive: true });
    operatorArguments.push(
      "--backup-dir",
      relative(repositoryRoot, fixture.backupDirectory).replaceAll("\\", "/"),
    );
  }

  const shellArguments = [
    "-c",
    'stub_path=$1; shift; PATH="$stub_path:$PATH"; export PATH; exec "$@"',
    "pilot-test",
    toPosixPath(fixture.stubDirectory),
    ...operatorArguments,
  ];

  return {
    commandLog,
    interpolationLog,
    environment: childEnvironment(fixture.stubDirectory, {
      KAUL_TEST_COMMAND_LOG: toPosixPath(commandLog),
      KAUL_TEST_INTERPOLATION_LOG: toPosixPath(interpolationLog),
      KAUL_TEST_CURRENT_DIGEST: "b".repeat(64),
      ...stub,
    }),
    shellArguments,
  };
}

function executePilotCommand(
  command,
  {
    overrides = {},
    omittedKey,
    stub = {},
    fixture,
    acquireOperationLock = false,
  } = {},
) {
  const commandFixture =
    fixture ?? createPilotCommandFixture({ overrides, omittedKey });
  const invocation = preparePilotInvocation(
    command,
    commandFixture,
    stub,
    acquireOperationLock,
  );

  const result = spawnSync(posixShellPath(), invocation.shellArguments, {
    encoding: "utf8",
    env: invocation.environment,
  });

  return {
    ...result,
    commandLog: readFileSync(invocation.commandLog, "utf8")
      .split(/\r?\n/)
      .filter(Boolean),
    interpolationSources: readFileSync(invocation.interpolationLog, "utf8")
      .split(/\r?\n/)
      .filter(Boolean),
    fixture: commandFixture,
    values: commandFixture.values,
  };
}

function startPilotCommand(command, fixture, stub = {}) {
  const invocation = preparePilotInvocation(command, fixture, stub, true);
  const child = spawn(posixShellPath(), invocation.shellArguments, {
    env: invocation.environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const completion = new Promise((resolve) => {
    child.on("close", (status, signal) => {
      resolve({
        commandLog: readFileSync(invocation.commandLog, "utf8")
          .split(/\r?\n/)
          .filter(Boolean),
        interpolationSources: readFileSync(invocation.interpolationLog, "utf8")
          .split(/\r?\n/)
          .filter(Boolean),
        signal,
        status,
        stderr,
        stdout,
      });
    });
  });

  return { child, completion };
}

async function waitForFile(path) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(path)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${path}`);
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

function tarHeaderString(header, offset, length) {
  const field = header.subarray(offset, offset + length);
  const nullIndex = field.indexOf(0);
  return field
    .subarray(0, nullIndex === -1 ? field.length : nullIndex)
    .toString();
}

function tarHeaderOctal(header, offset, length) {
  return Number.parseInt(tarHeaderString(header, offset, length).trim(), 8);
}

function readTarEntries(archive) {
  const entries = new Map();
  let offset = 0;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = tarHeaderString(header, 0, 100);
    const prefix = tarHeaderString(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const mode = tarHeaderOctal(header, 100, 8);
    const size = tarHeaderOctal(header, 124, 12);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;

    if (contentEnd > archive.length) {
      throw new Error(`Truncated tar entry: ${path}`);
    }

    entries.set(path, {
      content: archive.subarray(contentStart, contentEnd),
      mode,
    });
    offset = contentStart + Math.ceil(size / 512) * 512;
  }

  return entries;
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
  it("keeps executable Pilot shell scripts Linux-safe", () => {
    for (const [repositoryPath, filePath] of pilotShellScripts) {
      const content = readFileSync(filePath);

      expect(content.subarray(0, 10).toString("ascii")).toBe("#!/bin/sh\n");
      expect(content.includes(Buffer.from("\r\n"))).toBe(false);

      const attributes = spawnSync(
        "git",
        ["check-attr", "text", "eol", "--", repositoryPath],
        { cwd: repositoryRoot, encoding: "utf8" },
      );

      expect(attributes.status, outputOf(attributes)).toBe(0);
      expect(attributes.stdout).toContain(`${repositoryPath}: text: set`);
      expect(attributes.stdout).toContain(`${repositoryPath}: eol: lf`);

      const trackedMode = spawnSync(
        "git",
        ["ls-files", "--stage", "--", repositoryPath],
        { cwd: repositoryRoot, encoding: "utf8" },
      );

      expect(trackedMode.status, outputOf(trackedMode)).toBe(0);
      expect(trackedMode.stdout).toMatch(/^100755\s/);
    }
  });

  it("keeps executable Pilot shell scripts valid POSIX shell syntax", () => {
    const result = spawnSync(
      posixShellPath(),
      ["-n", ...pilotShellScripts.map(([, filePath]) => toPosixPath(filePath))],
      { encoding: "utf8" },
    );

    expect(result.status, outputOf(result)).toBe(0);
  });

  it("keeps archived Pilot shell scripts Linux-safe", () => {
    const result = spawnSync(
      "git",
      [
        "archive",
        "--format=tar",
        "HEAD",
        "--",
        ...pilotShellScripts.map(([repositoryPath]) => repositoryPath),
      ],
      { cwd: repositoryRoot },
    );

    expect(result.status, outputOf(result)).toBe(0);
    const archiveEntries = readTarEntries(result.stdout);

    for (const [repositoryPath] of pilotShellScripts) {
      const entry = archiveEntries.get(repositoryPath);

      expect(entry, `Missing archive entry: ${repositoryPath}`).toBeDefined();
      expect(
        entry.content.subarray(0, 10).equals(Buffer.from("#!/bin/sh\n")),
      ).toBe(true);
      expect(entry.content.includes(Buffer.from("\r\n"))).toBe(false);
      expect(entry.mode).toBe(0o775);
    }
  });

  it("requires immutable GHCR digests and never sources the environment file", () => {
    expect(script).toContain("@sha256:[0-9a-f]{64}");
    expect(script).not.toMatch(/(?:^|\n)\s*(?:source|\.)\s+[\"']?\$ENV_FILE/m);
    expect(script).toContain("The environment file is parsed as data");
  });

  it("creates and validates portable PostgreSQL backups", () => {
    expect(script).toContain("--format=custom");
    expect(script).toContain("sha256sum");
    expect(script).toContain("pg_restore --list");
    expect(script).toContain("mktemp");
    expect(script).toContain('mv -n -- "$TEMPORARY_BACKUP" "$archive"');
    expect(script).toContain("Backup destination already exists");
  });

  it("serializes every state-mutating or recovery operator workflow", () => {
    expect(script).toContain("LOCK_EX | LOCK_NB");
    expect(script).toContain(
      'lock_file="/tmp/kaul-pilot-${PILOT_COMPOSE_PROJECT}.pilot-ops.lock"',
    );
    expect(script).toContain('--project-name "$PILOT_COMPOSE_PROJECT"');
    expect(script).not.toContain("${ENV_FILE}.pilot-ops.lock");
    expect(script).toContain(
      "Another Pilot operator workflow is already running",
    );
    expect(script).toMatch(
      /backup\|restore\|migrate\|update\|start-postgres\|bootstrap-admin\|start-stack\) return 0/,
    );
  });

  it("sanitizes every variable interpolated by the Pilot Compose contract", () => {
    const composeKeys = [
      ...compose.matchAll(/(?<!\$)\$\{([A-Z][A-Z0-9_]*)/g),
    ].map((match) => match[1]);
    const contract = script.match(
      /COMPOSE_INTERPOLATION_KEYS='([\s\S]*?)'\r?\n/,
    );
    expect(contract).not.toBeNull();
    const sanitizedKeys = contract[1].trim().split(/\s+/);

    expect([...new Set(sanitizedKeys)].sort()).toEqual(
      [...new Set(composeKeys)].sort(),
    );
    expect(script).toContain("delete @ENV{@keys}");
  });

  it("routes every documented state-changing Compose example through the protected operator", () => {
    expect(pilotRunbook).not.toMatch(/^\s*docker compose\b/m);
    for (const command of [
      "start-postgres",
      "bootstrap-admin",
      "start-stack",
    ]) {
      expect(pilotRunbook).toContain(`scripts/pilot-ops.sh ${command}`);
    }
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
        /^  ([a-z]+):\r?\n([\s\S]*?)(?=^  [a-z]+:|^networks:)/gm,
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

  it("documents the clean-VM GHCR access and immutable identity gate", () => {
    expect(pilotRunbook).toContain("public GHCR package");
    expect(pilotRunbook).toContain("private GHCR package");
    expect(pilotRunbook).toContain("read:packages");
    expect(pilotRunbook).toContain("--password-stdin");
    expect(pilotRunbook).toContain("RepoDigests");
    expect(pilotRunbook).toContain("org.opencontainers.image.revision");
    expect(pilotRunbook).toContain(
      "cannot be completed before the image has actually been published",
    );
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
      "Compose project name",
      { COMPOSE_PROJECT_NAME: "Kaul Pilot" },
      "COMPOSE_PROJECT_NAME",
    ],
    [
      "Compose project name prefix",
      { COMPOSE_PROJECT_NAME: "-kaul-pilot" },
      "COMPOSE_PROJECT_NAME",
    ],
    [
      "Compose project name length",
      { COMPOSE_PROJECT_NAME: "a".repeat(64) },
      "COMPOSE_PROJECT_NAME",
    ],
    ["HTTPS binding", { PILOT_HTTPS_BIND: "443/tcp" }, "PILOT_HTTPS_BIND"],
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

  it.each(["KAUL_DB_USER", "PILOT_HTTPS_BIND"])(
    "rejects a missing required %s value",
    (key) => {
      const result = executePilotCommand("preflight", {
        omittedKey: key,
      });

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(`${key} must occur exactly once`);
    },
  );

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

  it("rejects a non-URL-safe authentication secret without printing it", () => {
    const malformedSecret = `${"a".repeat(31)}$`;
    const result = executePilotCommand("preflight", {
      overrides: { BETTER_AUTH_SECRET: malformedSecret },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("BETTER_AUTH_SECRET");
    expect(outputOf(result).includes(malformedSecret)).toBe(false);
  });
});

describe("Pilot Compose environment isolation", () => {
  it("uses the selected env file despite hostile ambient Pilot values", () => {
    const fixture = createPilotCommandFixture({
      overrides: {
        COMPOSE_PROJECT_NAME: uniqueComposeProject("ambient"),
      },
    });
    const hostileSecret = `hostile-${"x".repeat(40)}`;
    const result = executePilotCommand("start-postgres", {
      acquireOperationLock: true,
      fixture,
      stub: {
        COMPOSE_PROJECT_NAME: "ambient-project",
        KAUL_IMAGE: "ghcr.io/ambient/kaul:latest",
        DATABASE_URL: "postgresql://ambient:ambient@127.0.0.1:5432/kaul",
        DEPLOYMENT_ENV: "production",
        BETTER_AUTH_SECRET: hostileSecret,
        PILOT_HTTPS_BIND: "9443",
      },
    });

    expect(result.status, outputOf(result)).toBe(0);
    for (const key of [
      "COMPOSE_PROJECT_NAME",
      "KAUL_IMAGE",
      "DATABASE_URL",
      "DEPLOYMENT_ENV",
      "BETTER_AUTH_SECRET",
      "PILOT_HTTPS_BIND",
    ]) {
      const sources = result.interpolationSources.filter((entry) =>
        entry.startsWith(`${key}=`),
      );
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every((entry) => entry === `${key}=env-file`)).toBe(true);
    }
    const composeCommands = result.commandLog.filter((command) =>
      command.startsWith("compose --project-name "),
    );
    expect(composeCommands.length).toBeGreaterThan(0);
    expect(
      composeCommands.every((command) =>
        command.includes(
          `--project-name ${fixture.values.COMPOSE_PROJECT_NAME}`,
        ),
      ),
    ).toBe(true);
    expect(outputOf(result)).not.toContain(hostileSecret);
  }, 30_000);

  it.each([
    ["start-postgres", "up -d postgres"],
    ["bootstrap-admin", "npm run bootstrap:admin"],
    ["start-stack", " up -d"],
  ])(
    "protects the documented %s workflow",
    (command, expectedDockerCommand) => {
      const result = executePilotCommand(command, {
        stub: {
          KAUL_IMAGE: "ghcr.io/ambient/kaul:latest",
          DEPLOYMENT_ENV: "production",
        },
      });

      expect(result.status, outputOf(result)).toBe(0);
      expect(
        commandPosition(result.commandLog, expectedDockerCommand),
      ).toBeGreaterThan(-1);
      const protectedSources = result.interpolationSources.filter(
        (entry) =>
          entry.startsWith("KAUL_IMAGE=") ||
          entry.startsWith("DEPLOYMENT_ENV="),
      );
      expect(protectedSources.length).toBeGreaterThan(0);
      expect(
        protectedSources.every((entry) => entry.endsWith("=env-file")),
      ).toBe(true);
    },
  );
});

describe("Pilot update behavior", () => {
  it("keeps Caddy stopped until a healthy Kaul release passes validation", () => {
    const result = executePilotCommand("update");
    const commands = result.commandLog;

    expect(result.status, outputOf(result)).toBe(0);
    expect(commandPosition(commands, "stop caddy")).toBeLessThan(
      commandPosition(commands, "stop kaul"),
    );
    expect(commandPosition(commands, "stop kaul")).toBeLessThan(
      commandPosition(commands, "pg_dump"),
    );
    expect(commandPosition(commands, "pg_dump")).toBeLessThan(
      commandPosition(commands, "npm run db:deploy"),
    );
    expect(commandPosition(commands, "npm run db:deploy")).toBeLessThan(
      commandPosition(commands, "up -d --no-deps kaul"),
    );
    expect(commandPosition(commands, ".State.Health")).toBeLessThan(
      commandPosition(commands, "up -d --no-deps caddy"),
    );
  });

  it("rejects a second operator workflow before Docker mutation", async () => {
    const fixture = createPilotCommandFixture();
    const readyPath = join(fixture.directory, "first-operation-ready");
    const releasePath = join(fixture.directory, "release-first-operation");
    const first = startPilotCommand("update", fixture, {
      KAUL_TEST_BLOCK_PREFLIGHT: "1",
      KAUL_TEST_BLOCK_READY: toPosixPath(readyPath),
      KAUL_TEST_BLOCK_RELEASE: toPosixPath(releasePath),
    });

    let second;
    let firstResult;
    try {
      await waitForFile(readyPath);
      second = executePilotCommand("update", {
        acquireOperationLock: true,
        fixture,
      });
    } finally {
      writeFileSync(releasePath, "release\n");
      firstResult = await first.completion;
    }

    expect(second).toBeDefined();
    expect(second.status).not.toBe(0);
    expect(second.commandLog).toEqual([]);
    expect(outputOf(second)).toContain(
      "Another Pilot operator workflow is already running",
    );
    expect(firstResult.status, outputOf(firstResult)).toBe(0);

    fixture.backupDirectory = join(fixture.directory, "backup-after-release");
    const afterRelease = executePilotCommand("update", {
      acquireOperationLock: true,
      fixture,
    });
    expect(afterRelease.status, outputOf(afterRelease)).toBe(0);
  }, 30_000);

  it("serializes different env files that target the same Compose project", async () => {
    const project = uniqueComposeProject("shared");
    const firstFixture = createPilotCommandFixture({
      overrides: { COMPOSE_PROJECT_NAME: project },
    });
    const secondFixture = createPilotCommandFixture({
      overrides: { COMPOSE_PROJECT_NAME: project },
    });
    expect(secondFixture.environmentPath).not.toBe(
      firstFixture.environmentPath,
    );
    const readyPath = join(firstFixture.directory, "first-operation-ready");
    const releasePath = join(firstFixture.directory, "release-first-operation");
    const first = startPilotCommand("update", firstFixture, {
      KAUL_TEST_BLOCK_PREFLIGHT: "1",
      KAUL_TEST_BLOCK_READY: toPosixPath(readyPath),
      KAUL_TEST_BLOCK_RELEASE: toPosixPath(releasePath),
    });

    let second;
    let firstResult;
    try {
      await waitForFile(readyPath);
      second = executePilotCommand("backup", {
        acquireOperationLock: true,
        fixture: secondFixture,
      });
    } finally {
      writeFileSync(releasePath, "release\n");
      firstResult = await first.completion;
    }

    expect(second).toBeDefined();
    expect(second.status).not.toBe(0);
    expect(second.commandLog).toEqual([]);
    expect(outputOf(second)).toContain(
      "Another Pilot operator workflow is already running",
    );
    expect(firstResult.status, outputOf(firstResult)).toBe(0);
  }, 30_000);

  it("keeps different Compose project locks independent", async () => {
    const firstFixture = createPilotCommandFixture({
      overrides: {
        COMPOSE_PROJECT_NAME: uniqueComposeProject("first"),
      },
    });
    const secondFixture = createPilotCommandFixture({
      overrides: {
        COMPOSE_PROJECT_NAME: uniqueComposeProject("second"),
      },
    });
    expect(secondFixture.values.COMPOSE_PROJECT_NAME).not.toBe(
      firstFixture.values.COMPOSE_PROJECT_NAME,
    );
    const readyPath = join(firstFixture.directory, "first-operation-ready");
    const releasePath = join(firstFixture.directory, "release-first-operation");
    const first = startPilotCommand("update", firstFixture, {
      KAUL_TEST_BLOCK_PREFLIGHT: "1",
      KAUL_TEST_BLOCK_READY: toPosixPath(readyPath),
      KAUL_TEST_BLOCK_RELEASE: toPosixPath(releasePath),
    });

    let second;
    let firstResult;
    try {
      await waitForFile(readyPath);
      second = executePilotCommand("backup", {
        acquireOperationLock: true,
        fixture: secondFixture,
      });
    } finally {
      writeFileSync(releasePath, "release\n");
      firstResult = await first.completion;
    }

    expect(second).toBeDefined();
    expect(second.status, outputOf(second)).toBe(0);
    expect(commandPosition(second.commandLog, "pg_dump")).toBeGreaterThan(-1);
    expect(firstResult.status, outputOf(firstResult)).toBe(0);
  }, 30_000);

  it("refuses to replace a colliding completed backup", () => {
    const fixture = createPilotCommandFixture();
    const timestamp = "20260819T120000Z";
    mkdirSync(fixture.backupDirectory, { recursive: true });
    const archive = join(
      fixture.backupDirectory,
      `${fixture.values.KAUL_DB_NAME}_${timestamp}.dump`,
    );
    writeFileSync(archive, "existing verified backup\n");
    writeExecutable(fixture.stubDirectory, "date", [
      "#!/bin/sh",
      `printf '%s\\n' '${timestamp}'`,
    ]);

    const result = executePilotCommand("backup", { fixture });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "Backup destination already exists; refusing to replace it",
    );
    expect(readFileSync(archive, "utf8")).toBe("existing verified backup\n");
    expect(commandPosition(result.commandLog, "pg_dump")).toBe(-1);
  });

  it("does not continue when Caddy cannot be stopped", () => {
    const result = executePilotCommand("update", {
      stub: { KAUL_TEST_FAIL_CADDY_STOP: "1" },
    });

    expect(result.status).not.toBe(0);
    expect(commandPosition(result.commandLog, "stop caddy")).toBeGreaterThan(
      -1,
    );
    expect(commandPosition(result.commandLog, "stop kaul")).toBe(-1);
    expect(commandPosition(result.commandLog, "pg_dump")).toBe(-1);
    expect(outputOf(result)).toContain(
      "Caddy could not be stopped. Update did not proceed",
    );
  });

  it("leaves Caddy stopped when Kaul cannot be confirmed stopped", () => {
    const result = executePilotCommand("update", {
      stub: { KAUL_TEST_FAIL_KAUL_STOP: "1" },
    });

    expect(result.status).not.toBe(0);
    expect(commandPosition(result.commandLog, "stop caddy")).toBeGreaterThan(
      -1,
    );
    expect(commandPosition(result.commandLog, "stop kaul")).toBeGreaterThan(-1);
    expect(commandPosition(result.commandLog, "pg_dump")).toBe(-1);
    expect(outputOf(result)).toContain(
      "Kaul could not be stopped. Caddy remains stopped",
    );
  });

  it("keeps Kaul and Caddy stopped when the quiesced backup fails", () => {
    const result = executePilotCommand("update", {
      acquireOperationLock: true,
      stub: { KAUL_TEST_FAIL_BACKUP: "1" },
    });

    expect(result.status).not.toBe(0);
    expect(commandPosition(result.commandLog, "stop caddy")).toBeLessThan(
      commandPosition(result.commandLog, "stop kaul"),
    );
    expect(commandPosition(result.commandLog, "stop kaul")).toBeLessThan(
      commandPosition(result.commandLog, "pg_dump"),
    );
    expect(commandPosition(result.commandLog, "npm run db:deploy")).toBe(-1);
    expect(commandPosition(result.commandLog, "up -d --no-deps caddy")).toBe(
      -1,
    );
    expect(outputOf(result)).toContain("PostgreSQL backup failed");

    const retry = executePilotCommand("update", {
      acquireOperationLock: true,
      fixture: result.fixture,
    });
    expect(retry.status, outputOf(retry)).toBe(0);
  }, 30_000);

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
