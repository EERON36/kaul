import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, describe, expect, it } from "vitest";

const script = readFileSync(new URL("./pilot-ops.sh", import.meta.url), "utf8");
const compose = readFileSync(
  new URL("../compose.pilot.yaml", import.meta.url),
  "utf8",
);
const npmIngressCompose = readFileSync(
  new URL("../compose.pilot.npm.yaml", import.meta.url),
  "utf8",
);
const publicIngressCompose = readFileSync(
  new URL("../compose.pilot.public.yaml", import.meta.url),
  "utf8",
);
const caddy = readFileSync(
  new URL("../deploy/pilot/Caddyfile", import.meta.url),
  "utf8",
);
const npmCaddy = readFileSync(
  new URL("../deploy/pilot/Caddyfile.npm", import.meta.url),
  "utf8",
);
const publicCaddy = readFileSync(
  new URL("../deploy/pilot/Caddyfile.public", import.meta.url),
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
const validateWorkflow = readFileSync(
  new URL("../.github/workflows/validate.yml", import.meta.url),
  "utf8",
);
const resticCiInstaller = readFileSync(
  new URL("./install-pinned-restic-ci.sh", import.meta.url),
  "utf8",
);
const restServerVersionParserPath = fileURLToPath(
  new URL("./parse-rest-server-version.awk", import.meta.url),
);
const backupRehearsal = readFileSync(
  new URL("./pilot-backup-rehearsal.sh", import.meta.url),
  "utf8",
);
const pilotRunbook = readFileSync(
  new URL("../deploy/pilot/README.md", import.meta.url),
  "utf8",
);
const pilotEnvironmentExample = readFileSync(
  new URL("../deploy/pilot/pilot.env.example", import.meta.url),
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
const testSnapshotId = "c".repeat(64);

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

function awkPath() {
  const candidates =
    process.platform === "win32"
      ? ["C:\\Program Files\\Git\\usr\\bin\\awk.exe"]
      : ["/usr/bin/awk", "/bin/awk"];
  const executablePath = candidates.find((candidate) => existsSync(candidate));

  if (!executablePath) {
    throw new Error("awk is required for Pilot operator tests.");
  }

  return executablePath;
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
    PILOT_INGRESS_MODE: "npm",
    PILOT_CADDY_PRIVATE_BIND: "192.168.50.20:8080",
    PILOT_NPM_TRUSTED_PROXY_CIDR: "192.168.50.10/32",
    DEPLOYMENT_ENV: "pilot",
    BETTER_AUTH_URL: "https://pilot.example.test",
    BETTER_AUTH_SECRET: generatedSecret(),
    KAUL_PERSONNUMMER_KEYRING_HOST_FILE: "/tmp/overridden-by-fixture",
    POSTGRES_ADMIN_USER: "kaul_pilot_admin",
    POSTGRES_ADMIN_PASSWORD: generatedSecret(),
    KAUL_DB_USER: "kaul_pilot_app",
    KAUL_DB_PASSWORD: generatedSecret(),
    KAUL_DB_NAME: "kaul_pilot",
    RESTIC_EXPECTED_VERSION: "0.19.1",
    RESTIC_REPOSITORY: "rest:https://backup.invalid/kaul-pilot/",
    RESTIC_PASSWORD_FILE: "/tmp/overridden-by-fixture",
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
    "    for key in COMPOSE_PROJECT_NAME KAUL_IMAGE PILOT_HOSTNAME PILOT_INGRESS_MODE PILOT_CADDY_PRIVATE_BIND PILOT_NPM_TRUSTED_PROXY_CIDR DEPLOYMENT_ENV BETTER_AUTH_URL BETTER_AUTH_SECRET KAUL_PERSONNUMMER_KEYRING_HOST_FILE POSTGRES_ADMIN_USER POSTGRES_ADMIN_PASSWORD KAUL_DB_USER KAUL_DB_PASSWORD KAUL_DB_NAME DATABASE_URL; do",
    '      if printenv "$key" >/dev/null 2>&1; then source=ambient; else source=env-file; fi',
    '      printf \'%s=%s\\n\' "$key" "$source" >> "$KAUL_TEST_INTERPOLATION_LOG"',
    '      if [ "$key" = DATABASE_URL ] && [ -n "${KAUL_TEST_EXPECTED_DATABASE_URL:-}" ]; then',
    '        if [ "${DATABASE_URL:-}" = "$KAUL_TEST_EXPECTED_DATABASE_URL" ]; then match=yes; else match=no; fi',
    '        printf \'DATABASE_URL_MATCH=%s\\n\' "$match" >> "$KAUL_TEST_INTERPOLATION_LOG"',
    "      fi",
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
    '  *" ps --all --quiet kaul-restore-check "*) [ "${KAUL_TEST_RESTORE_CONTAINER_EXISTS:-0}" = 1 ] && printf \'%s\\n\' restore-test-container; exit 0 ;;',
    "  *\" ps -q kaul-restore-check \"*) printf '%s\\n' restore-test-container ; exit 0 ;;",
    "  *\" ps -q kaul \"*) printf '%s\\n' kaul-test-container ; exit 0 ;;",
    '  *" stop caddy "*) [ "${KAUL_TEST_FAIL_CADDY_STOP:-0}" != 1 ] ; exit $? ;;',
    '  *" stop kaul "*) [ "${KAUL_TEST_FAIL_KAUL_STOP:-0}" != 1 ] ; exit $? ;;',
    '  *"SELECT 1 FROM pg_database"*) [ "${KAUL_TEST_DATABASE_EXISTS:-0}" = 1 ] && printf \'1\\n\'; exit 0 ;;',
    '  *"KAUL_PRISTINE_DATABASE_CHECK"*)',
    '    [ "${KAUL_TEST_FAIL_PRISTINE_CHECK:-0}" != 1 ] || exit 1',
    "    printf '%s\\n' \"${KAUL_TEST_DATABASE_STATE:-populated}\"",
    "    exit 0 ;;",
    '  *" pg_dump "*) [ "${KAUL_TEST_FAIL_BACKUP:-0}" != 1 ] || exit 1; printf \'fictional custom archive\\n\' ; exit 0 ;;',
    '  *" pg_restore --list "*) cat >/dev/null ; exit 0 ;;',
    '  *" npm run db:deploy "*) [ "${KAUL_TEST_FAIL_MIGRATION:-0}" != 1 ] ; exit $? ;;',
    '  *" npm run db:status "*) exit 0 ;;',
    '  *" up -d --no-deps kaul-restore-check "*) [ "${KAUL_TEST_FAIL_RESTORE_CHECK_START:-0}" != 1 ] ; exit $? ;;',
    '  *" up -d --no-deps kaul "*) [ "${KAUL_TEST_FAIL_APP_START:-0}" != 1 ] ; exit $? ;;',
    '  *" up -d --no-deps caddy "*) [ "${KAUL_TEST_FAIL_CADDY_START:-0}" != 1 ] ; exit $? ;;',
    '  *" rm --force --stop kaul-restore-check "*) [ "${KAUL_TEST_FAIL_RESTORE_CHECK_REMOVE:-0}" != 1 ] ; exit $? ;;',
    "esac",
    "exit 0",
  ];
}

function resticStubLines() {
  return [
    "#!/bin/sh",
    "set -eu",
    'printf \'restic %s\\n\' "$*" >> "$KAUL_TEST_COMMAND_LOG"',
    'if [ "${1:-}" != version ] && [ -n "${KAUL_TEST_EXPECTED_RESTIC_REPOSITORY:-}" ]; then',
    '  [ "${RESTIC_REPOSITORY:-}" = "$KAUL_TEST_EXPECTED_RESTIC_REPOSITORY" ] || exit 91',
    '  [ "${RESTIC_PASSWORD_FILE:-}" = "$KAUL_TEST_EXPECTED_RESTIC_PASSWORD_FILE" ] || exit 92',
    '  [ "${RESTIC_PASSWORD+x}" != x ] || exit 93',
    '  if [ -n "${KAUL_TEST_EXPECTED_REST_USERNAME:-}" ]; then',
    '    [ "${RESTIC_REST_USERNAME:-}" = "$KAUL_TEST_EXPECTED_REST_USERNAME" ] || exit 94',
    '    [ "${RESTIC_REST_PASSWORD:-}" = "$KAUL_TEST_EXPECTED_REST_PASSWORD" ] || exit 95',
    "  fi",
    "fi",
    'case "${1:-}" in',
    "  version) printf '%s\\n' 'restic 0.19.1 compiled with go1.25.0 on linux/amd64'; exit 0 ;;",
    "  backup)",
    '    while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done',
    '    [ "${1:-}" = -- ] || exit 2',
    "    shift",
    '    "$@" >/dev/null || exit 1',
    `    printf '%s\\n' '{"message_type":"summary","total_bytes_processed":27,"snapshot_id":"${testSnapshotId}"}'`,
    "    ;;",
    `  snapshots) printf '%s\\n' '[{"id":"${testSnapshotId}"}]' ;;`,
    `  ls) printf '%s\\n' '{"message_type":"snapshot","id":"${testSnapshotId}"}' '{"struct_type":"node","path":"/kaul-pilot.dump","type":"file","size":27}' ;;`,
    "  dump) printf '%s\\n' 'fictional custom archive' ;;",
    "  forget|prune) exit 1 ;;",
    "  *) exit 2 ;;",
    "esac",
  ];
}

function createPilotCommandFixture({ overrides = {}, omittedKey } = {}) {
  const directory = createTemporaryDirectory();
  const stubDirectory = join(directory, "bin");
  const resticPasswordPath = join(directory, "restic-password");
  const personnummerKeyringPath = join(directory, "personnummer-keyring.json");
  writeFileSync(resticPasswordPath, `${generatedSecret()}\n`, { mode: 0o600 });
  chmodSync(resticPasswordPath, 0o600);
  writeFileSync(
    personnummerKeyringPath,
    '{"formatVersion":1,"activeKeyId":"fictional-test-key","keys":[{"id":"fictional-test-key","key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}]}\n',
    { mode: 0o400 },
  );
  chmodSync(personnummerKeyringPath, 0o400);
  const values = validPilotValues({
    RESTIC_PASSWORD_FILE: toPosixPath(resticPasswordPath),
    KAUL_PERSONNUMMER_KEYRING_HOST_FILE: toPosixPath(personnummerKeyringPath),
    ...overrides,
  });
  const environmentPath = writeEnvironmentFile(directory, values, omittedKey);
  mkdirSync(stubDirectory);
  writeExecutable(stubDirectory, "docker", dockerStubLines());
  writeExecutable(stubDirectory, "restic", resticStubLines());
  writeExecutable(stubDirectory, "id", [
    "#!/bin/sh",
    "set -eu",
    "case \"${1:-}\" in -u|-g) printf '1000\\n' ;; *) exit 2 ;; esac",
  ]);
  if (process.platform === "win32") {
    writeExecutable(stubDirectory, "mkfifo", [
      "#!/bin/sh",
      "set -eu",
      'for argument in "$@"; do case "$argument" in -*) ;; *) target=$argument ;; esac; done',
      ': > "$target"',
    ]);
  }

  return {
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
  database = "kaul_restore_test",
  snapshot = testSnapshotId,
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
  if (["validate-backup", "restore"].includes(command)) {
    operatorArguments.push("--snapshot", snapshot);
  }
  if (["restore", "start-restore-check"].includes(command)) {
    operatorArguments.push("--database", database);
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
    database,
    snapshot,
  } = {},
) {
  const commandFixture =
    fixture ?? createPilotCommandFixture({ overrides, omittedKey });
  const invocation = preparePilotInvocation(
    command,
    commandFixture,
    stub,
    acquireOperationLock,
    database,
    snapshot,
  );

  const result = spawnSync(posixShellPath(), invocation.shellArguments, {
    encoding: "utf8",
    env: invocation.environment,
    timeout: 60_000,
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
  for (let attempt = 0; attempt < 1_500; attempt += 1) {
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
  const commandLog = result.commandLog?.join("\n") ?? "";
  return `${result.stdout ?? ""}${result.stderr ?? ""}${commandLog}`;
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

function parseRestServerVersion(output, expected = "0.14.0") {
  return spawnSync(
    awkPath(),
    ["-v", `expected=${expected}`, "-f", restServerVersionParserPath],
    { encoding: "utf8", input: output },
  );
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

  it("enforces the Pilot environment file ownership and permission contract", () => {
    const validator = script.slice(
      script.indexOf("validate_environment_file()"),
      script.indexOf("load_compose_project()"),
    );
    expect(validator).toContain("O_RDONLY | O_NOFOLLOW | O_NONBLOCK");
    expect(script).toContain(
      "The Pilot environment file must be owned by the current operator.",
    );
    expect(script).toContain(
      "The Pilot environment file must not grant group or other permissions.",
    );
  });

  it("streams portable PostgreSQL backups into exact Restic snapshots", () => {
    expect(script).toContain("--format=custom");
    expect(script).toContain("--stdin-from-command");
    expect(script).toContain('run_restic dump "$snapshot"');
    expect(script).toContain("pg_restore --list");
    expect(script.indexOf('run_restic dump "$snapshot"')).toBeLessThan(
      script.indexOf("pg_restore --list"),
    );
    expect(script).toContain("mkfifo -m 600");
    expect(script).toContain("Snapshot ID must contain exactly 64");
    expect(script).toContain("delete @ENV{grep { /^RESTIC_/ } keys %ENV}");
    expect(script).not.toContain("--archive");
    expect(script).not.toContain("latest");
    expect(script).toContain("exec pg_dump --username");
  });

  it("pins Restic CI artifacts by version and publisher checksum", () => {
    expect(resticCiInstaller).toContain("RESTIC_VERSION=0.19.1");
    expect(resticCiInstaller).toContain(
      "RESTIC_SHA256=f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c",
    );
    expect(resticCiInstaller).toContain("REST_SERVER_VERSION=0.14.0");
    expect(resticCiInstaller).toContain(
      "REST_SERVER_SHA256=4c9c95bc079a0334e81fad379b19dc5c3353c71c2c88d652cafce2081c2b1c66",
    );
    expect(resticCiInstaller).toContain(
      '-f "$SCRIPT_DIRECTORY/parse-rest-server-version.awk"',
    );
    expect(resticCiInstaller).toContain("sha256sum --check --status");
    expect(resticCiInstaller).toContain(
      "TARGET_DIRECTORY already exists; refusing to replace it",
    );
    expect(resticCiInstaller).not.toMatch(/\/latest(?:\/|$)/);
  });

  it("accepts the actual pinned rest-server 0.14.0 version output", () => {
    const result = parseRestServerVersion(
      "rest-server version rest-server 0.14.0 compiled with go1.24.3 on linux/amd64\n\n",
    );

    expect(result.status, outputOf(result)).toBe(0);
    expect(result.stdout).toBe("0.14.0\n");
  });

  it("rejects a different semantic rest-server version", () => {
    const result = parseRestServerVersion(
      "rest-server version rest-server 0.13.0 compiled with go1.24.3 on linux/amd64\n",
    );

    expect(result.status, outputOf(result)).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("rejects malformed rest-server version output", () => {
    const result = parseRestServerVersion(
      "rest-server version rest-server unknown compiled with go1.24.3 on linux/amd64\n",
    );

    expect(result.status, outputOf(result)).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("rejects the expected rest-server number in the wrong semantic position", () => {
    const result = parseRestServerVersion(
      "rest-server version 0.14.0 compiled with go1.24.3 on linux/amd64\n",
    );

    expect(result.status, outputOf(result)).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("rejects nonblank rest-server output after the semantic version line", () => {
    const result = parseRestServerVersion(
      "rest-server version rest-server 0.14.0 compiled with go1.24.3 on linux/amd64\nunexpected output\n",
    );

    expect(result.status, outputOf(result)).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("runs a separate real append-only backup rehearsal on Ubuntu", () => {
    expect(validateWorkflow).toContain("backup-rehearsal:");
    expect(validateWorkflow).toContain("runs-on: ubuntu-latest");
    expect(validateWorkflow).toContain("scripts/install-pinned-restic-ci.sh");
    expect(validateWorkflow).toContain("set -o pipefail");
    expect(validateWorkflow).toContain(
      "if operator_entry=$(getent passwd 1000)",
    );
    expect(validateWorkflow).toContain("operator_name=${operator_entry%%:*}");
    expect(validateWorkflow).toContain("kaul-backup-ci-checkout.XXXXXX");
    expect(validateWorkflow).toContain("--exclude='./.git'");
    expect(validateWorkflow).toContain("--exclude='./.next'");
    expect(validateWorkflow).toContain('sudo --user "$KAUL_CI_OPERATOR"');
    expect(validateWorkflow).toContain('bash "$KAUL_CI_OPERATOR_WORKSPACE"');
    expect(validateWorkflow).toContain(
      'PATH="/usr/local/kaul-backup-tools:$PATH"',
    );
    expect(validateWorkflow).toContain("scripts/pilot-backup-rehearsal.sh");
    expect(backupRehearsal).toContain("--append-only");
    expect(backupRehearsal).toContain('"$SCRIPT_DIR/pilot-ops.sh" backup');
    expect(backupRehearsal).toContain(
      '"$SCRIPT_DIR/pilot-ops.sh" validate-backup',
    );
    expect(backupRehearsal).toContain('restic dump "$snapshot_id"');
    expect(backupRehearsal).toContain('restic forget "$snapshot_id"');
    expect(backupRehearsal).not.toContain("restic dump latest");
  });

  it("waits for the final PostgreSQL server before the backup fixture", () => {
    const readiness = backupRehearsal.match(
      /wait_for_postgres\(\) \{[\s\S]*?\n\}/,
    )?.[0];
    expect(readiness).toBeDefined();
    expect(readiness).toContain("for _ in $(seq 1 60)");
    expect(readiness).toContain('cat /proc/1/comm)" = postgres');
    expect(readiness).toContain("pg_isready");
    expect(readiness).toContain('--command="SELECT 1;"');
    expect(readiness.indexOf("cat /proc/1/comm")).toBeLessThan(
      readiness.indexOf("pg_isready"),
    );
    expect(readiness.indexOf("pg_isready")).toBeLessThan(
      readiness.indexOf("psql"),
    );
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
      /backup\|restore\|start-restore-check\|stop-restore-check\|migrate\|migrate-pristine\|convert-personnummer\|update\|start-postgres\|bootstrap-admin\|start-stack\) return 0/,
    );
  });

  it("allows a backup-deferred migration only for a proven pristine database", () => {
    const result = executePilotCommand("migrate-pristine", {
      stub: { KAUL_TEST_DATABASE_STATE: "pristine" },
    });

    expect(result.status, outputOf(result)).toBe(0);
    const stopPosition = commandPosition(result.commandLog, "stop kaul");
    const pristineCheckPosition = commandPosition(
      result.commandLog,
      "KAUL_PRISTINE_DATABASE_CHECK",
    );
    const migrationPosition = commandPosition(
      result.commandLog,
      "npm run db:deploy",
    );
    expect(stopPosition).toBeGreaterThan(-1);
    expect(pristineCheckPosition).toBeGreaterThan(stopPosition);
    expect(migrationPosition).toBeGreaterThan(pristineCheckPosition);
    expect(commandPosition(result.commandLog, "pg_dump")).toBe(-1);
    expect(outputOf(result)).toContain(
      "PostgreSQL pristine first-install check passed",
    );
    expect(outputOf(result)).toContain("Backup readiness remains deferred");
  }, 15_000);

  it("rejects the pristine exception once application schema or data exists", () => {
    const result = executePilotCommand("migrate-pristine", {
      stub: { KAUL_TEST_DATABASE_STATE: "populated" },
    });

    expect(result.status).not.toBe(0);
    expect(
      commandPosition(result.commandLog, "KAUL_PRISTINE_DATABASE_CHECK"),
    ).toBeGreaterThan(-1);
    expect(commandPosition(result.commandLog, "npm run db:deploy")).toBe(-1);
    expect(commandPosition(result.commandLog, "pg_dump")).toBe(-1);
    expect(outputOf(result)).toContain(
      "requires a database with no application schema or data",
    );
    expect(script).toContain("FROM pg_largeobject_metadata");
    expect(script).toContain("FROM pg_extension");
    expect(script).toContain("extname <> 'plpgsql'");
  });

  it("rejects the pristine exception when PostgreSQL cannot prove the state", () => {
    const result = executePilotCommand("migrate-pristine", {
      stub: { KAUL_TEST_FAIL_PRISTINE_CHECK: "1" },
    });

    expect(result.status).not.toBe(0);
    expect(commandPosition(result.commandLog, "npm run db:deploy")).toBe(-1);
    expect(commandPosition(result.commandLog, "pg_dump")).toBe(-1);
    expect(outputOf(result)).toContain(
      "could not inspect PostgreSQL. No migration was attempted",
    );
  });

  it("keeps the normal migration backup requirement unchanged", () => {
    const result = executePilotCommand("migrate");

    expect(result.status, outputOf(result)).toBe(0);
    const backupPosition = commandPosition(result.commandLog, "pg_dump");
    const migrationPosition = commandPosition(
      result.commandLog,
      "npm run db:deploy",
    );
    expect(backupPosition).toBeGreaterThan(-1);
    expect(migrationPosition).toBeGreaterThan(backupPosition);
    expect(outputOf(result)).not.toContain("Backup readiness remains deferred");
  }, 15_000);

  it("keeps attended Personnummer conversion behind a backup and stopped application", () => {
    const result = executePilotCommand("convert-personnummer");

    expect(result.status, outputOf(result)).toBe(0);
    const stopPosition = commandPosition(result.commandLog, "stop kaul");
    const backupPosition = commandPosition(result.commandLog, "pg_dump");
    const conversionPosition = commandPosition(
      result.commandLog,
      "npm run personnummer:convert-legacy -- --confirm-stage-b",
    );
    expect(stopPosition).toBeGreaterThan(-1);
    expect(backupPosition).toBeGreaterThan(stopPosition);
    expect(conversionPosition).toBeGreaterThan(backupPosition);
    expect(outputOf(result)).toContain("Kaul remains stopped");
  }, 15_000);

  it("sanitizes every variable interpolated by the Pilot Compose contract", () => {
    const composeKeys = [
      ...[compose, npmIngressCompose, publicIngressCompose].flatMap((file) => [
        ...file.matchAll(/(?<!\$)\$\{([A-Z][A-Z0-9_]*)/g),
      ]),
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
      "start-restore-check",
      "stop-restore-check",
      "convert-personnummer",
    ]) {
      expect(pilotRunbook).toContain(`scripts/pilot-ops.sh ${command}`);
    }
  });

  it("restores only into a new guarded database without destructive clean flags", () => {
    expect(script).toContain("restore_suffix=${database#kaul_restore_}");
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

  it("publishes only Caddy through the selected ingress contract", () => {
    const publicPortServices = [
      ...compose.matchAll(
        /^  ([a-z][a-z0-9-]*):\r?\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:|^networks:)/gm,
      ),
    ]
      .filter(([, , block]) => /^    ports:/m.test(block))
      .map((match) => match[1]);
    expect(publicPortServices).toEqual([]);
    expect(npmIngressCompose).toContain(
      "${PILOT_CADDY_PRIVATE_BIND:?Set PILOT_CADDY_PRIVATE_BIND to the VM private IP and port}:8080",
    );
    expect(npmIngressCompose).toContain(
      "${PILOT_NPM_TRUSTED_PROXY_CIDR:?Set PILOT_NPM_TRUSTED_PROXY_CIDR to the verified Caddy-observed NPM peer /32}",
    );
    expect(compose).not.toContain("PILOT_NPM_TRUSTED_PROXY_CIDR");
    expect(npmIngressCompose).not.toContain(":80:80");
    expect(npmIngressCompose).not.toContain(":443:443");
    expect(publicIngressCompose).toContain('"80:80"');
    expect(publicIngressCompose).toContain('"443:443"');
    expect(compose).toContain("internal: true");
    const restoreCheckService = compose.match(
      /^  kaul-restore-check:\r?\n([\s\S]*?)(?=^  postgres:)/m,
    )?.[1];
    expect(restoreCheckService).toContain("- restore-check");
    expect(restoreCheckService).toContain('restart: "no"');
    expect(restoreCheckService).not.toMatch(/^    ports:/m);
    expect(caddy).toContain("import Caddyfile.{$PILOT_INGRESS_MODE}");
    expect(npmCaddy).not.toContain("kaul-restore-check");
    expect(npmCaddy).toContain(
      "trusted_proxies static {$PILOT_NPM_TRUSTED_PROXY_CIDR}",
    );
    expect(npmCaddy).toContain("trusted_proxies_strict");
    expect(npmCaddy).toContain(
      "@unexpectedPeer not remote_ip {$PILOT_NPM_TRUSTED_PROXY_CIDR}",
    );
    expect(npmCaddy).toContain("header_up X-Real-IP {client_ip}");
    expect(npmCaddy).toContain("header_up X-Forwarded-For {client_ip}");
    expect(npmCaddy).toContain("header_up X-Forwarded-Proto https");
    expect(npmCaddy).toContain("header_up -CF-Connecting-IP");
    expect(publicCaddy).toContain("header_up X-Real-IP {remote_host}");
    expect(publicCaddy).not.toContain("trusted_proxies");
  });

  it("keeps the existing-VM host preflight read-only and explicit", () => {
    const hostPreflightFunction = script.slice(
      script.indexOf("host_preflight()"),
      script.indexOf("validate_restic_password_file()"),
    );

    expect(script).toContain(
      "scripts/pilot-ops.sh host-preflight --env-file PATH",
    );
    expect(script).toContain("Ubuntu 22.04, 24.04, or 26.04 LTS is required");
    expect(script).toContain("at least 2 vCPUs");
    expect(script).toContain("at least 4 GiB RAM");
    expect(script).toContain("at least 20 GiB free");
    expect(script).toContain(
      "PILOT_CADDY_PRIVATE_BIND address is not configured",
    );
    expect(script).toContain("The Pilot host has no IPv4 route to NPM");
    expect(script).toContain("Docker-aware firewall proof");
    expect(hostPreflightFunction).not.toMatch(
      /\b(?:apt|apt-get)\s+(?:install|upgrade)\b/,
    );
    expect(hostPreflightFunction).not.toMatch(
      /\bsystemctl\s+(?:enable|start|stop|restart)\b/,
    );
    expect(hostPreflightFunction).not.toMatch(
      /\bdocker\s+compose\s+(?:up|down|run|start|stop|rm)\b/,
    );
    expect(hostPreflightFunction).not.toMatch(
      /\b(?:ufw|iptables|nft)\b|\bip\s+(?:address|addr|route)\s+(?:add|delete|del|replace)\b/,
    );
    expect(pilotEnvironmentExample).toContain(
      "PILOT_NPM_TRUSTED_PROXY_CIDR=REPLACE_WITH_CADDY_OBSERVED_NPM_PEER_IPV4/32",
    );
    expect(pilotEnvironmentExample).not.toMatch(
      /^PILOT_NPM_TRUSTED_PROXY_CIDR=\d/m,
    );
  });

  it("builds a pinned non-root application image without environment files", () => {
    expect(
      dockerfile.match(
        /FROM node:24\.18\.0-bookworm-slim@sha256:[0-9a-f]{64}/g,
      ),
    ).toHaveLength(2);
    expect(dockerfile).toMatch(/USER node\s+\n\s*EXPOSE 3000/);
    expect(dockerfile).toContain('test "$(id -u node)" = 1000');
    expect(script).toContain(
      "The dedicated Pilot operator UID must match the Kaul runtime UID",
    );
    expect(dockerfile).toContain("org.opencontainers.image.revision");
    expect(dockerignore).toMatch(/^\.env\*$/m);
    expect(dockerignore).toMatch(/^\*\*\/\.env\*$/m);
    expect(dockerfile).not.toMatch(/COPY\s+.*\.env/i);
    expect(compose).toMatch(/image: caddy:2\.11\.4-alpine@sha256:[0-9a-f]{64}/);
    expect(compose).toMatch(
      /image: postgres:18\.4-bookworm@sha256:[0-9a-f]{64}/,
    );
    expect(
      compose.match(
        /KAUL_PERSONNUMMER_KEYRING_FILE: \/run\/secrets\/kaul-personnummer-keyring\.json/g,
      ),
    ).toHaveLength(2);
    expect(
      compose.match(/source: \$\{KAUL_PERSONNUMMER_KEYRING_HOST_FILE:/g),
    ).toHaveLength(2);
    expect(compose.match(/read_only: true/g)?.length).toBeGreaterThanOrEqual(2);
    expect(compose).not.toMatch(/KAUL_PERSONNUMMER_KEYRING=(?!_FILE)/);
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
  it.skipIf(process.platform === "win32")(
    "rejects a Pilot environment file with group or other permissions",
    () => {
      const fixture = createPilotCommandFixture();
      chmodSync(fixture.environmentPath, 0o640);

      const result = executePilotCommand("preflight", { fixture });

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(
        "The Pilot environment file must not grant group or other permissions.",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects a symlinked Pilot environment file",
    () => {
      const fixture = createPilotCommandFixture();
      const symlinkPath = join(fixture.directory, "pilot-symlink.env");
      symlinkSync(fixture.environmentPath, symlinkPath);
      fixture.environmentPath = symlinkPath;

      const result = executePilotCommand("preflight", { fixture });

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(
        "The Pilot environment file must be readable and not a symlink.",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects a Pilot environment FIFO without blocking",
    () => {
      const fixture = createPilotCommandFixture();
      const fifoPath = join(fixture.directory, "pilot.env.fifo");
      const fifoResult = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
      expect(fifoResult.status, fifoResult.stderr).toBe(0);
      fixture.environmentPath = fifoPath;

      const result = executePilotCommand("preflight", { fixture });

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(
        "The Pilot environment file must be a regular file.",
      );
    },
  );

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
  }, 15_000);

  it("accepts the future direct-public Caddy ingress contract", () => {
    const result = executePilotCommand("preflight", {
      overrides: {
        PILOT_INGRESS_MODE: "public",
      },
    });

    expect(result.status, outputOf(result)).toBe(0);
    expect(result.commandLog.join("\n")).toContain("compose.pilot.public.yaml");
  }, 15_000);

  it("keeps direct-public Caddy independent of NPM trust input", () => {
    const result = executePilotCommand("preflight", {
      omittedKey: "PILOT_NPM_TRUSTED_PROXY_CIDR",
      overrides: {
        PILOT_INGRESS_MODE: "public",
      },
    });

    expect(result.status, outputOf(result)).toBe(0);
    expect(result.commandLog.join("\n")).toContain("compose.pilot.public.yaml");
  }, 15_000);

  it("rejects a broad NPM trusted-proxy subnet", () => {
    const result = executePilotCommand("preflight", {
      overrides: {
        PILOT_NPM_TRUSTED_PROXY_CIDR: "192.168.50.0/24",
      },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("one exact private IPv4 /32");
  });

  it("rejects a listener address reused as the trusted proxy", () => {
    const result = executePilotCommand("preflight", {
      overrides: {
        PILOT_NPM_TRUSTED_PROXY_CIDR: "192.168.50.20/32",
      },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "NPM proxy address and Kaul VM listener address must differ",
    );
  });

  it("rejects a malformed NPM private listener", () => {
    const result = executePilotCommand("preflight", {
      overrides: { PILOT_CADDY_PRIVATE_BIND: "192.168.50.20" },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("must use PRIVATE_IPV4:PORT format");
  });

  it("rejects ambiguous IPv4 octets with leading zeroes", () => {
    const result = executePilotCommand("preflight", {
      overrides: { PILOT_CADDY_PRIVATE_BIND: "192.168.050.20:8080" },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("without leading zeroes");
  });

  it("rejects local Restic repositories", () => {
    const result = executePilotCommand("preflight", {
      overrides: { RESTIC_REPOSITORY: "/var/backups/kaul" },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("must use an off-host backend");
  });

  it("rejects REST credentials embedded in the repository URL", () => {
    const result = executePilotCommand("preflight", {
      overrides: {
        RESTIC_REPOSITORY:
          "rest:https://writer:fictional-secret@backup.invalid/kaul/",
      },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("must not embed REST credentials");
    expect(outputOf(result)).not.toContain("fictional-secret");
  });

  it("requires the reviewed Restic version", () => {
    const result = executePilotCommand("preflight", {
      overrides: { RESTIC_EXPECTED_VERSION: "0.18.1" },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "RESTIC_EXPECTED_VERSION must be 0.19.1",
    );
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
    [
      "Caddy private port",
      { PILOT_CADDY_PRIVATE_BIND: "192.168.50.20:443/tcp" },
      "PILOT_CADDY_PRIVATE_BIND",
    ],
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

  it.each([
    "KAUL_DB_USER",
    "PILOT_NPM_TRUSTED_PROXY_CIDR",
    "KAUL_IMAGE",
    "BETTER_AUTH_SECRET",
    "KAUL_PERSONNUMMER_KEYRING_HOST_FILE",
    "RESTIC_REPOSITORY",
  ])("rejects a missing required %s value", (key) => {
    const result = executePilotCommand("preflight", {
      omittedKey: key,
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(`${key} must occur exactly once`);
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

  it("rejects a non-URL-safe authentication secret without printing it", () => {
    const malformedSecret = `${"a".repeat(31)}$`;
    const result = executePilotCommand("preflight", {
      overrides: { BETTER_AUTH_SECRET: malformedSecret },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("BETTER_AUTH_SECRET");
    expect(outputOf(result).includes(malformedSecret)).toBe(false);
  });

  it("rejects a relative Personnummer keyring path", () => {
    const result = executePilotCommand("preflight", {
      overrides: {
        KAUL_PERSONNUMMER_KEYRING_HOST_FILE: "relative-keyring.json",
      },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("must be an absolute path");
  });

  it("rejects a Pilot operator UID that cannot read the runtime keyring", () => {
    const fixture = createPilotCommandFixture();
    writeExecutable(fixture.stubDirectory, "id", [
      "#!/bin/sh",
      "set -eu",
      "printf '1001\\n'",
    ]);
    const result = executePilotCommand("preflight", { fixture });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("must match the Kaul runtime UID 1000");
  });

  it("rejects a directory as the Personnummer keyring", () => {
    const fixture = createPilotCommandFixture();
    const result = executePilotCommand("preflight", {
      fixture,
      overrides: undefined,
    });
    const directoryResult = executePilotCommand("preflight", {
      overrides: {
        KAUL_PERSONNUMMER_KEYRING_HOST_FILE: toPosixPath(fixture.directory),
      },
    });

    expect(result.status, outputOf(result)).toBe(0);
    expect(directoryResult.status).not.toBe(0);
    expect(outputOf(directoryResult)).toContain("regular file");
  });

  it.runIf(process.platform !== "win32")(
    "rejects group-readable Personnummer keyring permissions",
    () => {
      const fixture = createPilotCommandFixture();
      chmodSync(fixture.values.KAUL_PERSONNUMMER_KEYRING_HOST_FILE, 0o440);
      const result = executePilotCommand("preflight", { fixture });

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain("mode 0400");
    },
  );
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
        KAUL_PERSONNUMMER_KEYRING_HOST_FILE: "/tmp/hostile-keyring.json",
        PILOT_CADDY_PRIVATE_BIND: "192.168.50.20:9443",
      },
    });

    expect(result.status, outputOf(result)).toBe(0);
    for (const key of [
      "COMPOSE_PROJECT_NAME",
      "KAUL_IMAGE",
      "DATABASE_URL",
      "DEPLOYMENT_ENV",
      "BETTER_AUTH_SECRET",
      "KAUL_PERSONNUMMER_KEYRING_HOST_FILE",
      "PILOT_CADDY_PRIVATE_BIND",
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
    15_000,
  );
});

describe("Pilot private restore-check behavior", () => {
  it("starts only the profile-gated private service with a trusted restored-database override", () => {
    const fixture = createPilotCommandFixture({
      overrides: {
        COMPOSE_PROJECT_NAME: uniqueComposeProject("restore-check"),
      },
    });
    const restoreDatabase = "kaul_restore_20260822";
    const expectedRestoreUrl = fixture.values.DATABASE_URL.replace(
      /\/[^/]+$/,
      `/${restoreDatabase}`,
    );
    const hostileDatabaseUrl =
      "postgresql://hostile:hostile@127.0.0.1:5432/hostile";
    const result = executePilotCommand("start-restore-check", {
      acquireOperationLock: true,
      database: restoreDatabase,
      fixture,
      stub: {
        DATABASE_URL: hostileDatabaseUrl,
        KAUL_TEST_DATABASE_EXISTS: "1",
        KAUL_TEST_EXPECTED_DATABASE_URL: expectedRestoreUrl,
      },
    });

    expect(result.status, outputOf(result)).toBe(0);
    expect(
      commandPosition(
        result.commandLog,
        "--profile restore-check run --rm --no-deps kaul-restore-check npm run db:status",
      ),
    ).toBeGreaterThan(-1);
    expect(
      commandPosition(
        result.commandLog,
        "--profile restore-check up -d --no-deps kaul-restore-check",
      ),
    ).toBeGreaterThan(-1);
    expect(commandPosition(result.commandLog, ".State.Health")).toBeGreaterThan(
      -1,
    );
    expect(
      result.commandLog.some((command) => command.endsWith(" stop caddy")),
    ).toBe(false);
    expect(
      result.commandLog.some((command) =>
        command.endsWith(" up -d --no-deps caddy"),
      ),
    ).toBe(false);
    expect(
      result.commandLog.some((command) => command.endsWith(" stop kaul")),
    ).toBe(false);
    expect(
      result.commandLog.some((command) =>
        command.endsWith(" up -d --no-deps kaul"),
      ),
    ).toBe(false);
    expect(result.interpolationSources).toContain("DATABASE_URL_MATCH=yes");
    expect(
      result.interpolationSources.filter(
        (entry) => entry === "DATABASE_URL_MATCH=yes",
      ).length,
    ).toBeGreaterThanOrEqual(3);
    for (const key of [
      "COMPOSE_PROJECT_NAME",
      "KAUL_IMAGE",
      "DEPLOYMENT_ENV",
      "BETTER_AUTH_SECRET",
      "KAUL_PERSONNUMMER_KEYRING_HOST_FILE",
      "KAUL_DB_NAME",
    ]) {
      const sources = result.interpolationSources.filter((entry) =>
        entry.startsWith(`${key}=`),
      );
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every((entry) => entry === `${key}=env-file`)).toBe(true);
    }
    expect(outputOf(result)).not.toContain(hostileDatabaseUrl);
    expect(outputOf(result)).not.toContain(expectedRestoreUrl);
    expect(outputOf(result)).not.toContain(fixture.values.KAUL_DB_PASSWORD);
    expect(outputOf(result)).toContain(
      `Private restore check is healthy against database: ${restoreDatabase}`,
    );
  }, 60_000);

  it("rejects an invalid restored-database name before startup", () => {
    const invalid = executePilotCommand("start-restore-check", {
      database: "kaul_restore_invalid-name",
      stub: { KAUL_TEST_DATABASE_EXISTS: "1" },
    });
    expect(invalid.status).not.toBe(0);
    expect(outputOf(invalid)).toContain(
      "Restore database may contain only lowercase letters, digits, and underscores",
    );
    expect(commandPosition(invalid.commandLog, "kaul-restore-check")).toBe(-1);
  }, 15_000);

  it("rejects an absent restored database before startup", () => {
    const absent = executePilotCommand("start-restore-check");
    expect(absent.status).not.toBe(0);
    expect(outputOf(absent)).toContain("Restore database does not exist");
    expect(commandPosition(absent.commandLog, " up -d ")).toBe(-1);
  }, 15_000);

  it("refuses to replace an existing private restore check", () => {
    const existing = executePilotCommand("start-restore-check", {
      stub: {
        KAUL_TEST_DATABASE_EXISTS: "1",
        KAUL_TEST_RESTORE_CONTAINER_EXISTS: "1",
      },
    });
    expect(existing.status).not.toBe(0);
    expect(outputOf(existing)).toContain(
      "A private restore check already exists",
    );
    expect(commandPosition(existing.commandLog, " up -d ")).toBe(-1);
  }, 15_000);

  it("removes an unhealthy private check without changing live services", () => {
    const result = executePilotCommand("start-restore-check", {
      stub: {
        KAUL_TEST_DATABASE_EXISTS: "1",
        KAUL_TEST_HEALTH_STATUS: "unhealthy",
      },
    });

    expect(result.status).not.toBe(0);
    expect(
      commandPosition(
        result.commandLog,
        "rm --force --stop kaul-restore-check",
      ),
    ).toBeGreaterThan(-1);
    expect(commandPosition(result.commandLog, "stop caddy")).toBe(-1);
    expect(
      result.commandLog.some((command) => command.endsWith(" stop kaul")),
    ).toBe(false);
    expect(outputOf(result)).toContain(
      "private restore check was unhealthy and was removed",
    );
  }, 60_000);

  it("cleans up a failed private-check startup without changing live services", () => {
    const result = executePilotCommand("start-restore-check", {
      stub: {
        KAUL_TEST_DATABASE_EXISTS: "1",
        KAUL_TEST_FAIL_RESTORE_CHECK_START: "1",
      },
    });

    expect(result.status).not.toBe(0);
    expect(
      commandPosition(result.commandLog, "up -d --no-deps kaul-restore-check"),
    ).toBeGreaterThan(-1);
    expect(
      commandPosition(
        result.commandLog,
        "rm --force --stop kaul-restore-check",
      ),
    ).toBeGreaterThan(-1);
    expect(commandPosition(result.commandLog, "stop caddy")).toBe(-1);
    expect(
      result.commandLog.some((command) => command.endsWith(" stop kaul")),
    ).toBe(false);
    expect(outputOf(result)).toContain("restore-check startup failed");
  }, 60_000);

  it("stops only the private check and preserves every database", () => {
    const result = executePilotCommand("stop-restore-check", {
      stub: { KAUL_TEST_RESTORE_CONTAINER_EXISTS: "1" },
    });

    expect(result.status, outputOf(result)).toBe(0);
    expect(
      commandPosition(
        result.commandLog,
        "rm --force --stop kaul-restore-check",
      ),
    ).toBeGreaterThan(-1);
    expect(commandPosition(result.commandLog, "dropdb")).toBe(-1);
    expect(commandPosition(result.commandLog, "DROP DATABASE")).toBe(-1);
    expect(commandPosition(result.commandLog, "stop caddy")).toBe(-1);
    expect(
      result.commandLog.some((command) => command.endsWith(" stop kaul")),
    ).toBe(false);
    expect(outputOf(result)).toContain("Restored databases were preserved");

    const absent = executePilotCommand("stop-restore-check");
    expect(absent.status, outputOf(absent)).toBe(0);
    expect(outputOf(absent)).toContain("No private restore check exists");
    expect(commandPosition(absent.commandLog, " rm ")).toBe(-1);
  }, 60_000);

  it("serializes restore-check start and stop by Compose project", async () => {
    const fixture = createPilotCommandFixture({
      overrides: {
        COMPOSE_PROJECT_NAME: uniqueComposeProject("restore-lock"),
      },
    });
    const readyPath = join(fixture.directory, "restore-check-lock-ready");
    const releasePath = join(fixture.directory, "restore-check-lock-release");
    const first = startPilotCommand("start-restore-check", fixture, {
      KAUL_TEST_BLOCK_PREFLIGHT: "1",
      KAUL_TEST_BLOCK_READY: toPosixPath(readyPath),
      KAUL_TEST_BLOCK_RELEASE: toPosixPath(releasePath),
      KAUL_TEST_DATABASE_EXISTS: "1",
    });

    let second;
    let firstResult;
    try {
      await waitForFile(readyPath);
      second = executePilotCommand("stop-restore-check", {
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
  }, 60_000);
});

describe("Pilot Restic backup and restore behavior", () => {
  it("uses the selected Restic config despite hostile ambient values", () => {
    const fixture = createPilotCommandFixture();
    const result = executePilotCommand("backup", {
      fixture,
      stub: {
        KAUL_TEST_EXPECTED_RESTIC_REPOSITORY: fixture.values.RESTIC_REPOSITORY,
        KAUL_TEST_EXPECTED_RESTIC_PASSWORD_FILE:
          fixture.values.RESTIC_PASSWORD_FILE,
        RESTIC_REPOSITORY: "/hostile/local/repository",
        RESTIC_PASSWORD: "hostile-ambient-password",
        RESTIC_PASSWORD_FILE: "/hostile/password-file",
        RESTIC_REST_USERNAME: "fictional-rest-writer",
        RESTIC_REST_PASSWORD: "fictional-rest-backend-secret",
        KAUL_TEST_EXPECTED_REST_USERNAME: "fictional-rest-writer",
        KAUL_TEST_EXPECTED_REST_PASSWORD: "fictional-rest-backend-secret",
      },
    });

    expect(result.status, outputOf(result)).toBe(0);
    expect(outputOf(result)).not.toContain("hostile-ambient-password");
  }, 60_000);

  it("creates, identifies, and validates one exact snapshot", () => {
    const result = executePilotCommand("backup");

    expect(result.status, outputOf(result)).toBe(0);
    expect(result.stdout).toContain(
      `Backup snapshot created and validated: ${testSnapshotId}`,
    );
    expect(commandPosition(result.commandLog, "restic backup")).toBeLessThan(
      commandPosition(result.commandLog, "pg_dump"),
    );
    expect(commandPosition(result.commandLog, "pg_dump")).toBeLessThan(
      commandPosition(result.commandLog, "restic snapshots"),
    );
    expect(commandPosition(result.commandLog, "restic dump")).toBeGreaterThan(
      -1,
    );
    expect(
      commandPosition(result.commandLog, "pg_restore --list"),
    ).toBeGreaterThan(-1);
  }, 60_000);

  it("publishes no successful snapshot when pg_dump fails", () => {
    const result = executePilotCommand("backup", {
      stub: { KAUL_TEST_FAIL_BACKUP: "1" },
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "Restic did not publish a successful snapshot",
    );
    expect(commandPosition(result.commandLog, "pg_dump")).toBeGreaterThan(-1);
    expect(commandPosition(result.commandLog, "restic snapshots")).toBe(-1);
  }, 60_000);

  it("rejects an ambiguous or shortened snapshot selector", () => {
    const result = executePilotCommand("validate-backup", {
      snapshot: testSnapshotId.slice(0, 12),
    });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "Snapshot ID must contain exactly 64 lowercase hexadecimal characters",
    );
    expect(commandPosition(result.commandLog, "restic snapshots")).toBe(-1);
  }, 15_000);

  it("restores the selected snapshot only into a new guarded database", () => {
    const result = executePilotCommand("restore", {
      database: "kaul_restore_exact_ci",
    });

    expect(result.status, outputOf(result)).toBe(0);
    expect(
      commandPosition(result.commandLog, "restic snapshots"),
    ).toBeGreaterThan(-1);
    expect(commandPosition(result.commandLog, "restic dump")).toBeGreaterThan(
      -1,
    );
    expect(commandPosition(result.commandLog, "createdb")).toBeGreaterThan(-1);
    expect(outputOf(result)).toContain(
      "Restore completed into new database: kaul_restore_exact_ci",
    );
  }, 60_000);
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
  }, 60_000);

  it("rejects a second operator workflow before Docker mutation", async () => {
    const fixture = createPilotCommandFixture({
      overrides: {
        COMPOSE_PROJECT_NAME: uniqueComposeProject("same-workflow"),
      },
    });
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

    const afterRelease = executePilotCommand("update", {
      acquireOperationLock: true,
      fixture,
    });
    expect(afterRelease.status, outputOf(afterRelease)).toBe(0);
  }, 120_000);

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
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);

  it("keeps Kaul and Caddy stopped when the quiesced backup fails", () => {
    const fixture = createPilotCommandFixture({
      overrides: {
        COMPOSE_PROJECT_NAME: uniqueComposeProject("backup-failure"),
      },
    });
    const result = executePilotCommand("update", {
      acquireOperationLock: true,
      fixture,
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
  }, 120_000);

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
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);
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
