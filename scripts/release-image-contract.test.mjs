import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const fictionalEnvironment = {
  DATABASE_URL: "postgresql://build:build-only@127.0.0.1:5432/kaul_build",
  DEPLOYMENT_ENV: "test",
  BETTER_AUTH_SECRET: "fictional-container-build-value-not-a-runtime-secret",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
};

function operatorCommand(name) {
  const command = packageJson.scripts[name];
  const tokens = command.split(/\s+/);
  const entryIndex = tokens.findIndex((token) => token.endsWith(".ts"));

  if (tokens[0] !== "node" || entryIndex < 1) {
    throw new Error(`Unsupported operator command shape: ${name}`);
  }

  return {
    entry: tokens[entryIndex],
    nodeOptions: tokens.slice(1, entryIndex),
  };
}

function outputOf(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

describe("release image operator dependency contract", () => {
  it("owns every direct package required by supported runtime operators", () => {
    for (const dependency of ["dotenv", "prisma", "server-only", "tsx"]) {
      expect(packageJson.dependencies[dependency]).toBeTypeOf("string");
      expect(packageJson.devDependencies[dependency]).toBeUndefined();
    }

    expect(packageJson.scripts["db:deploy"]).toBe("prisma migrate deploy");
    expect(packageJson.scripts["db:status"]).toBe("prisma migrate status");
  });

  it("resolves the bootstrap domain through the official server-only condition", () => {
    const bootstrap = operatorCommand("bootstrap:admin");
    const recovery = operatorCommand("bootstrap:admin:recover");

    expect(bootstrap.entry).toBe("scripts/bootstrap-admin.ts");
    expect(recovery.entry).toBe("scripts/bootstrap-admin-recover.ts");
    expect(recovery.nodeOptions).toEqual(bootstrap.nodeOptions);
    expect(bootstrap.nodeOptions).toContain("--conditions=react-server");
    expect(bootstrap.nodeOptions).toContain("tsx");

    const initialAdministratorUrl = new URL(
      "../src/modules/users/initial-administrator.ts",
      import.meta.url,
    ).href;
    const result = spawnSync(
      process.execPath,
      [
        ...bootstrap.nodeOptions,
        "--input-type=module",
        "--eval",
        `await Promise.all([import("dotenv/config"), import(${JSON.stringify(initialAdministratorUrl)})])`,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, ...fictionalEnvironment },
      },
    );

    expect(result.status, outputOf(result)).toBe(0);
  });
});
