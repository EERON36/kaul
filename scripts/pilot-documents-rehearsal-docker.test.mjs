import { describe, expect, it } from "vitest";
import {
  classifyFixtureCommand,
  FIXTURE_IMAGE,
} from "./pilot-documents-rehearsal-docker.mjs";

const env = {
  CI: "true",
  GITHUB_ACTIONS: "true",
  GITHUB_RUN_ID: "12345",
  GITHUB_SHA: "b".repeat(40),
  KAUL_CI_REPOSITORY_ROOT: "/tmp/checkout",
  KAUL_CI_ENV_FILE: "/tmp/rehearsal/pilot.env",
  KAUL_CI_APP_DATABASE_URL:
    "postgresql://fictional:fictional@127.0.0.1:45231/kaul_test_ci_backup_documents",
  KAUL_CI_RESTORE_ROOT: "/tmp/rehearsal/restored",
  DATABASE_URL:
    "postgresql://fictional:fictional@postgres:5432/kaul_restore_ci_backup_documents",
  DOCUMENT_STORAGE_HOST_PATH: "/tmp/rehearsal/restored",
};
const prefix = [
  "compose",
  "--project-name",
  "kaul-pilot-documents-ci-12345",
  "--project-directory",
  "/tmp/checkout",
  "--env-file",
  "/tmp/rehearsal/pilot.env",
  "-f",
  "/tmp/checkout/compose.pilot.yaml",
  "-f",
  "/tmp/checkout/compose.pilot.npm.yaml",
];
const status = [
  "--profile",
  "restore-check",
  "run",
  "--rm",
  "--no-deps",
  "kaul-restore-check",
  "npm",
  "run",
  "db:status",
];
const revision = [
  "image",
  "inspect",
  "--format",
  '{{index .Config.Labels "org.opencontainers.image.revision"}}',
  FIXTURE_IMAGE,
];
describe("unpublished image CI seam", () => {
  it("passes through the exact single-file pg_dump child used by Restic", () => {
    const dump = [
      ...prefix.slice(0, -2),
      "exec",
      "-T",
      "postgres",
      "sh",
      "-ec",
      'exec pg_dump --username="$KAUL_DB_USER" --dbname="$KAUL_DB_NAME" --format=custom --no-owner --no-acl',
    ];
    expect(classifyFixtureCommand(dump, env)).toEqual({ kind: "docker" });
  });
  it("does not broaden the single-file Compose allowance", () => {
    const base = prefix.slice(0, -2);
    const dump = [
      "exec",
      "-T",
      "postgres",
      "sh",
      "-ec",
      'exec pg_dump --username="$KAUL_DB_USER" --dbname="$KAUL_DB_NAME" --format=custom --no-owner --no-acl',
    ];
    for (const args of [
      [...base, ...dump, "extra"],
      [...base, ...dump.slice(0, -1), "exec psql"],
      [...base, ...dump.map((arg) => (arg === "postgres" ? "kaul" : arg))],
      [
        ...base.map((arg) =>
          arg === "kaul-pilot-documents-ci-12345" ? "kaul-pilot" : arg,
        ),
        ...dump,
      ],
      [...base, ...status],
      [...base, "ps"],
    ])
      expect(() => classifyFixtureCommand(args, env)).toThrow();
  });
  it("matches only the exact fictional image revision lookup", () => {
    expect(classifyFixtureCommand(revision, env)).toEqual({ kind: "revision" });
    for (const args of [
      revision.slice(0, -1),
      [...revision, "extra"],
      revision.map((arg) =>
        arg === FIXTURE_IMAGE ? `${FIXTURE_IMAGE.slice(0, -1)}b` : arg,
      ),
      ["inspect", FIXTURE_IMAGE],
    ])
      expect(() => classifyFixtureCommand(args, env)).toThrow();
  });
  it("maps exact restored-db status to the real guarded loopback database", () => {
    const result = classifyFixtureCommand([...prefix, ...status], env);
    expect(result.kind).toBe("migration-status");
    const target = new URL(result.databaseUrl);
    expect(target.hostname).toBe("127.0.0.1");
    expect(target.port).toBe("45231");
    expect(target.pathname).toBe("/kaul_restore_ci_backup_documents");
  });
  it.each([
    ["run", "--rm", "--no-deps", "kaul", "npm", "run", "db:status"],
    [...status, "extra"],
    status.slice(0, -1),
    status.map((arg) => (arg === "db:status" ? "db:deploy" : arg)),
    ["--profile", "restore-check", "up", "-d", "kaul-restore-check"],
    ["up", "-d", "kaul"],
    ["start", "kaul"],
    ["pull", "kaul"],
    ["exec", "-T", "kaul", "npm", "run", "db:status"],
  ])("refuses unexpected application command %#", (...command) => {
    expect(() =>
      classifyFixtureCommand([...prefix, ...command], env),
    ).toThrow();
  });
  it.each([
    { CI: undefined },
    { GITHUB_ACTIONS: undefined },
    { GITHUB_RUN_ID: "" },
    { GITHUB_SHA: "not-a-sha" },
    {
      DATABASE_URL: env.DATABASE_URL.replace(
        "kaul_restore_ci_backup_documents",
        "kaul",
      ),
    },
    { DOCUMENT_STORAGE_HOST_PATH: "/var/lib/kaul/documents" },
    {
      KAUL_CI_APP_DATABASE_URL: env.KAUL_CI_APP_DATABASE_URL.replace(
        "127.0.0.1",
        "remote.invalid",
      ),
    },
    {
      KAUL_CI_APP_DATABASE_URL: env.KAUL_CI_APP_DATABASE_URL.replace(
        "kaul_test_ci_backup_documents",
        "kaul",
      ),
    },
  ])("refuses unsafe or missing fixture context %#", (change) => {
    expect(() =>
      classifyFixtureCommand([...prefix, ...status], { ...env, ...change }),
    ).toThrow();
  });
  it("refuses a different Compose project or additional option", () => {
    expect(() =>
      classifyFixtureCommand(
        [
          ...prefix.map((arg) =>
            arg === "kaul-pilot-documents-ci-12345" ? "kaul-pilot" : arg,
          ),
          ...status,
        ],
        env,
      ),
    ).toThrow();
    expect(() =>
      classifyFixtureCommand(
        [...prefix, "--env-file", "/other", ...status],
        env,
      ),
    ).toThrow();
  });
  it.each([
    ["config", "--quiet"],
    ["ps", "--status", "running", "--quiet", "kaul", "caddy"],
    ["stop", "kaul"],
    ["stop", "caddy"],
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "--dbname=kaul_restore_ci_backup_documents",
    ],
  ])("delegates real data and quiescence commands %#", (...command) => {
    expect(classifyFixtureCommand([...prefix, ...command], env)).toEqual({
      kind: "docker",
    });
  });
});
