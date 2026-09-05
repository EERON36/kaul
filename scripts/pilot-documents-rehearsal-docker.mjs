#!/usr/bin/env node
// CI-only seam for an unpublished image. All data operations use real Docker.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FIXTURE_IMAGE = `ghcr.io/fictional-kaul/kaul@sha256:${"a".repeat(64)}`;
export const RESTORE_DATABASE = "kaul_restore_ci_backup_documents";

export function classifyFixtureCommand(args, env) {
  if (
    env.CI !== "true" ||
    env.GITHUB_ACTIONS !== "true" ||
    !/^[0-9]+$/.test(env.GITHUB_RUN_ID ?? "") ||
    !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? "")
  )
    throw new Error("CI fixture guard failed.");
  if (
    JSON.stringify(args) ===
    JSON.stringify([
      "image",
      "inspect",
      "--format",
      '{{index .Config.Labels "org.opencontainers.image.revision"}}',
      FIXTURE_IMAGE,
    ])
  )
    return { kind: "revision" };
  if (args[0] !== "compose")
    throw new Error("Unexpected Docker fixture command.");
  if (JSON.stringify(args) === JSON.stringify(["compose", "version"]))
    return { kind: "docker" };
  const prefix = [
    "compose",
    "--project-name",
    `kaul-pilot-documents-ci-${env.GITHUB_RUN_ID}`,
    "--project-directory",
    env.KAUL_CI_REPOSITORY_ROOT,
    "--env-file",
    env.KAUL_CI_ENV_FILE,
    "-f",
    `${env.KAUL_CI_REPOSITORY_ROOT}/compose.pilot.yaml`,
    "-f",
    `${env.KAUL_CI_REPOSITORY_ROOT}/compose.pilot.npm.yaml`,
  ];
  // Restic starts this exact pg_dump child with only the base Compose file.
  // It remains a real Docker/data operation, scoped to this CI project.
  if (
    JSON.stringify(args) ===
    JSON.stringify([
      ...prefix.slice(0, -2),
      "exec",
      "-T",
      "postgres",
      "sh",
      "-ec",
      'exec pg_dump --username="$KAUL_DB_USER" --dbname="$KAUL_DB_NAME" --format=custom --no-owner --no-acl',
    ])
  )
    return { kind: "docker" };
  if (!prefix.every((arg, index) => arg === args[index]))
    throw new Error("Unexpected Compose fixture scope.");
  const command = args.slice(prefix.length);
  if (
    JSON.stringify(command) ===
    JSON.stringify([
      "--profile",
      "restore-check",
      "run",
      "--rm",
      "--no-deps",
      "kaul-restore-check",
      "npm",
      "run",
      "db:status",
    ])
  ) {
    const local = new URL(env.KAUL_CI_APP_DATABASE_URL);
    if (
      local.protocol !== "postgresql:" ||
      local.hostname !== "127.0.0.1" ||
      !/^[0-9]+$/.test(local.port) ||
      local.pathname !== "/kaul_test_ci_backup_documents"
    )
      throw new Error("Unexpected restore fixture database.");
    local.pathname = `/${RESTORE_DATABASE}`;
    const internal = new URL(local);
    internal.hostname = "postgres";
    internal.port = "5432";
    if (
      env.DATABASE_URL !== internal.href ||
      env.DOCUMENT_STORAGE_HOST_PATH !== env.KAUL_CI_RESTORE_ROOT
    )
      throw new Error("Unexpected restore fixture target.");
    return { kind: "migration-status", databaseUrl: local.href };
  }
  // No application execution or arbitrary Docker mutation is emulated.
  if (
    command[0] === "config" ||
    command[0] === "ps" ||
    (command[0] === "exec" &&
      command[1] === "-T" &&
      command[2] === "postgres") ||
    (command[0] === "stop" &&
      command.length === 2 &&
      ["kaul", "caddy"].includes(command[1]))
  )
    return { kind: "docker" };
  throw new Error("Unexpected application fixture command.");
}

export function runFixtureCommand(args, env = process.env) {
  const action = classifyFixtureCommand(args, env);
  if (action.kind === "revision") {
    process.stdout.write(`${env.GITHUB_SHA}\n`);
    return 0;
  }
  const result =
    action.kind === "migration-status"
      ? spawnSync(
          process.execPath,
          [
            resolve(
              env.KAUL_CI_REPOSITORY_ROOT,
              "node_modules/prisma/build/index.js",
            ),
            "migrate",
            "status",
          ],
          {
            cwd: env.KAUL_CI_REPOSITORY_ROOT,
            stdio: "inherit",
            env: {
              ...env,
              DATABASE_URL: action.databaseUrl,
              INTEGRATION_DATABASE_URL: action.databaseUrl,
            },
          },
        )
      : spawnSync(env.KAUL_CI_REAL_DOCKER, args, { stdio: "inherit", env });
  if (result.error || result.signal || result.status === null)
    throw new Error("CI fixture command failed.");
  return result.status;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.exitCode = runFixtureCommand(process.argv.slice(2));
  } catch {
    process.stderr.write(
      "Documents rehearsal Docker adapter refused or failed a command.\n",
    );
    process.exitCode = 1;
  }
}
