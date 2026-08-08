import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";

import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  collectBootstrapMetadata,
  formatBootstrapSuccess,
  getBootstrapCliErrorMessage,
  writeBootstrapCliError,
} from "../../../scripts/bootstrap-admin";
import {
  bootstrapInitialAdministrator,
  InitialAdministratorBootstrapError,
  type InitialAdministratorInput,
} from "./initial-administrator";
import { bootstrapInitialAdministratorInternal } from "./initial-administrator-internal";
import {
  bootstrapInitialAdministratorForTest,
  generateTemporaryCredentialForTest,
  parseInitialAdministratorInputForTest,
} from "./initial-administrator.test-support";

const validMetadata = {
  organisationName: "Fiktiva Omsorgen",
  administratorName: "Fiktiv Administratör",
  administratorEmail: "admin@example.test",
  professionalTitle: "Fiktiv verksamhetsansvarig",
};

describe("initial Administrator input", () => {
  it("trims and accepts only the four approved metadata fields", () => {
    expect(
      parseInitialAdministratorInputForTest({
        organisationName: ` ${validMetadata.organisationName} `,
        administratorName: ` ${validMetadata.administratorName} `,
        administratorEmail: ` ${validMetadata.administratorEmail} `,
        professionalTitle: ` ${validMetadata.professionalTitle} `,
      }),
    ).toEqual(validMetadata);
  });

  it.each([
    "role",
    "organisationId",
    "password",
    "mustChangePassword",
    "expiry",
    "banned",
    "data",
  ])("rejects the forbidden property %s", (property) => {
    expect(() =>
      parseInitialAdministratorInputForTest({
        ...validMetadata,
        [property]: "untrusted-value",
      }),
    ).toThrow();
  });

  it("enforces the approved length and email limits", () => {
    expect(() =>
      parseInitialAdministratorInputForTest({
        ...validMetadata,
        organisationName: " ",
      }),
    ).toThrow();
    expect(() =>
      parseInitialAdministratorInputForTest({
        ...validMetadata,
        administratorName: "a".repeat(201),
      }),
    ).toThrow();
    expect(() =>
      parseInitialAdministratorInputForTest({
        ...validMetadata,
        administratorEmail: `${"a".repeat(250)}@example.test`,
      }),
    ).toThrow();
    expect(() =>
      parseInitialAdministratorInputForTest({
        ...validMetadata,
        professionalTitle: "a".repeat(121),
      }),
    ).toThrow();
  });
});

describe("initial Administrator temporary credential", () => {
  it("generates a 256-bit base64url credential within the password policy", () => {
    const credential = generateTemporaryCredentialForTest();

    expect(credential).toHaveLength(43);
    expect(credential).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("formats the credential exactly once without internal state", () => {
    const credential = "fictional-temporary-credential-2026";
    const output = formatBootstrapSuccess({
      organisationName: validMetadata.organisationName,
      administratorEmail: validMetadata.administratorEmail,
      temporaryCredential: credential,
      temporaryCredentialExpiresAt: new Date("2030-01-02T03:04:05.000Z"),
    });

    expect(output.match(new RegExp(credential, "g"))).toHaveLength(1);
    expect(output).toContain("shown once");
    expect(output).toContain("must change");
    expect(output).not.toContain("organisationId");
    expect(output).not.toContain("DATABASE_URL");
    expect(output).not.toContain("password hash");
    expect(output).not.toContain("session");
  });
});

describe("initial Administrator CLI", () => {
  it("rejects input that ends before all metadata is collected", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const collection = collectBootstrapMetadata(input, output);

    input.end("Fiktiva Omsorgen\n");

    await expect(collection).rejects.toThrow(
      "Bootstrap input ended before all metadata was provided.",
    );
  });

  it("uses only the production bootstrap entry point", () => {
    const source = readFileSync(
      new URL("../../../scripts/bootstrap-admin.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'from "../src/modules/users/initial-administrator"',
    );
    expect(source).not.toContain("initial-administrator.test-support");
    expect(source).not.toContain("initial-administrator-internal");
  });

  it("maps a known refusal by code instead of trusting its message", () => {
    const unsafeMessage = "unsafe fictional credential must not appear";
    const error = new InitialAdministratorBootstrapError(
      "INSTALLATION_NOT_EMPTY",
      unsafeMessage,
    );

    expect(getBootstrapCliErrorMessage(error)).toBe(
      "Initial Administrator bootstrap requires an empty installation.",
    );
    expect(getBootstrapCliErrorMessage(error)).not.toContain(unsafeMessage);
  });

  it.each([
    "fictional-secret-credential-must-not-appear",
    "postgresql://fictional:fictional-password@db.example.test/fictional",
  ])("replaces an unexpected error containing %s", (unsafeMessage) => {
    const standardOutput = new PassThrough();
    const standardError = new PassThrough();

    writeBootstrapCliError(new Error(unsafeMessage), standardError);

    const stdoutText = standardOutput.read()?.toString() ?? "";
    const stderrText = standardError.read()?.toString() ?? "";
    expect(stdoutText).toBe("");
    expect(stderrText).toBe("Initial Administrator bootstrap failed.\n");
    expect(`${stdoutText}${stderrText}`).not.toContain(unsafeMessage);
    expect(stderrText).not.toContain("at ");
  });
});

describe("initial Administrator production API", () => {
  it("accepts only the strict four-field metadata contract", () => {
    expectTypeOf<
      Parameters<typeof bootstrapInitialAdministrator>
    >().toEqualTypeOf<[input: InitialAdministratorInput]>();
    expectTypeOf<keyof InitialAdministratorInput>().toEqualTypeOf<
      | "organisationName"
      | "administratorName"
      | "administratorEmail"
      | "professionalTitle"
    >();
  });

  it("rejects role, password, organisation, and system fields before database access", async () => {
    const invalidMetadata = {
      ...validMetadata,
      role: "STAFF_MEMBER",
      password: "operator-selected-password",
      organisationId: "operator-selected-organisation",
      mustChangePassword: false,
      temporaryCredentialExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
      data: { arbitrary: true },
    };

    await expect(
      bootstrapInitialAdministrator(invalidMetadata),
    ).rejects.toThrow();
  });
});

describe("initial Administrator test support", () => {
  it("permits test dependencies when NODE_ENV is test", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(() =>
      parseInitialAdministratorInputForTest(validMetadata),
    ).not.toThrow();
  });

  it("refuses immediately outside NODE_ENV=test", () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      expect(() =>
        bootstrapInitialAdministratorForTest(validMetadata, {
          generateCredential: () => "operator-selected-password",
        }),
      ).toThrow("test support is available only in tests");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("cannot bypass the production guard by importing the internal function", async () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      await expect(
        bootstrapInitialAdministratorInternal(validMetadata, {
          currentTime: () => new Date("2030-01-01T00:00:00.000Z"),
        }),
      ).rejects.toThrow("dependencies are available only in tests");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
