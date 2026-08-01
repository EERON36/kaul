import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment";

describe("environment configuration", () => {
  it("accepts fictional PostgreSQL development configuration", () => {
    expect(
      parseEnvironment({
        DATABASE_URL:
          "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
        DEPLOYMENT_ENV: "development",
      }),
    ).toEqual({
      DATABASE_URL:
        "postgresql://kaul:local-development-only@127.0.0.1:5432/kaul",
      DEPLOYMENT_ENV: "development",
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
      }),
    ).toThrow("DATABASE_URL must use the PostgreSQL protocol");
  });
});
