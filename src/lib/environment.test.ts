import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment";

describe("environment configuration", () => {
  it("accepts fictional PostgreSQL development configuration", () => {
    expect(
      parseEnvironment({
        DATABASE_URL:
          "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
        DEPLOYMENT_ENV: "development",
        BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    ).toEqual({
      DATABASE_URL:
        "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
      DEPLOYMENT_ENV: "development",
      BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
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
      }),
    ).toThrow("BETTER_AUTH_URL must use HTTPS outside development and tests");
  });

  it("accepts an HTTPS Better Auth URL for pilot and production", () => {
    expect(
      parseEnvironment({
        DATABASE_URL:
          "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
        DEPLOYMENT_ENV: "pilot",
        BETTER_AUTH_SECRET: "fictional-test-secret-at-least-32-characters",
        BETTER_AUTH_URL: "https://kaul.example.test",
      }).BETTER_AUTH_URL,
    ).toBe("https://kaul.example.test");
  });
});
