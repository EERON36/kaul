import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

import { parseEnvironment } from "./environment";

const keyringPath = resolve("test-fixtures/personnummer-keyring.json");

describe("environment configuration", () => {
  it("accepts fictional PostgreSQL development configuration", () => {
    expect(
      parseEnvironment({
        DATABASE_URL:
          "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
        DEPLOYMENT_ENV: "development",
        BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
        BETTER_AUTH_URL: "http://localhost:3000",
        KAUL_PERSONNUMMER_KEYRING_FILE: keyringPath,
      }),
    ).toEqual({
      DATABASE_URL:
        "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
      DEPLOYMENT_ENV: "development",
      BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
      KAUL_PERSONNUMMER_KEYRING_FILE: keyringPath,
    });
  });

  it("rejects a missing database URL", () => {
    expect(() => parseEnvironment({ DEPLOYMENT_ENV: "test" })).toThrow(
      "Invalid environment configuration",
    );
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: "https://example.test/database",
        DEPLOYMENT_ENV: "test",
        BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
        BETTER_AUTH_URL: "http://localhost:3000",
        KAUL_PERSONNUMMER_KEYRING_FILE: keyringPath,
      }),
    ).toThrow("DATABASE_URL must use the PostgreSQL protocol");
  });

  it("rejects a Better Auth secret shorter than 32 characters", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL:
          "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
        DEPLOYMENT_ENV: "test",
        BETTER_AUTH_SECRET: "too-short",
        BETTER_AUTH_URL: "http://localhost:3000",
        KAUL_PERSONNUMMER_KEYRING_FILE: keyringPath,
      }),
    ).toThrow("BETTER_AUTH_SECRET");
  });

  it("allows HTTP only for local development and tests", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL:
          "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
        DEPLOYMENT_ENV: "production",
        BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
        BETTER_AUTH_URL: "http://localhost:3000",
        KAUL_PERSONNUMMER_KEYRING_FILE: keyringPath,
      }),
    ).toThrow("BETTER_AUTH_URL must use HTTPS outside development and tests");
  });

  it("accepts an HTTPS Better Auth URL for pilot and production", () => {
    expect(
      parseEnvironment({
        DATABASE_URL:
          "postgresql://kaul_pilot:fictional@postgres:5432/kaul_pilot",
        DEPLOYMENT_ENV: "pilot",
        BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
        BETTER_AUTH_URL: "https://kaul.example.test",
        KAUL_PERSONNUMMER_KEYRING_FILE: keyringPath,
      }).BETTER_AUTH_URL,
    ).toBe("https://kaul.example.test");
  });

  it("rejects the normal development database for Pilot", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL:
          "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
        DEPLOYMENT_ENV: "pilot",
        BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
        BETTER_AUTH_URL: "https://kaul.example.test",
        KAUL_PERSONNUMMER_KEYRING_FILE: keyringPath,
      }),
    ).toThrow("Pilot DATABASE_URL must not use a loopback host");
  });

  it("rejects a system database for Pilot even on a private host", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL:
          "postgresql://kaul_pilot:fictional@postgres:5432/postgres",
        DEPLOYMENT_ENV: "pilot",
        BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
        BETTER_AUTH_URL: "https://kaul.example.test",
        KAUL_PERSONNUMMER_KEYRING_FILE: keyringPath,
      }),
    ).toThrow(
      "Pilot DATABASE_URL must use a separate non-development database",
    );
  });
});
