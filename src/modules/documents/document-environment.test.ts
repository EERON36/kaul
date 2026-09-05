import { describe, expect, it } from "vitest";

import { parseDocumentEnvironment } from "./document-environment";

describe("Documents environment", () => {
  it.each([0.5, 12, 24])(
    "accepts a signature age ceiling of %s hours",
    (age) => {
      expect(
        parseDocumentEnvironment({
          DOCUMENT_STORAGE_ROOT:
            process.platform === "win32"
              ? "C:\\kaul-test-documents"
              : "/tmp/kaul-test-documents",
          DOCUMENT_SCANNER_HOST: "clamav",
          DOCUMENT_SCANNER_PORT: "3310",
          DOCUMENT_SCANNER_TIMEOUT_MS: "15000",
          DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: String(age),
        }).DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS,
      ).toBe(age);
    },
  );

  it.each([24.001, 25, 72, 168])(
    "rejects a signature age ceiling of %s hours",
    (age) => {
      expect(() =>
        parseDocumentEnvironment({
          DOCUMENT_STORAGE_ROOT:
            process.platform === "win32"
              ? "C:\\kaul-test-documents"
              : "/tmp/kaul-test-documents",
          DOCUMENT_SCANNER_HOST: "clamav",
          DOCUMENT_SCANNER_PORT: "3310",
          DOCUMENT_SCANNER_TIMEOUT_MS: "15000",
          DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: String(age),
        }),
      ).toThrow("Invalid Documents configuration");
    },
  );

  it("requires explicit absolute storage and scanner fail-closed settings", () => {
    const root =
      process.platform === "win32"
        ? "C:\\kaul-test-documents"
        : "/tmp/kaul-test-documents";
    expect(
      parseDocumentEnvironment({
        DOCUMENT_STORAGE_ROOT: root,
        DOCUMENT_SCANNER_HOST: "clamav",
        DOCUMENT_SCANNER_PORT: "3310",
        DOCUMENT_SCANNER_TIMEOUT_MS: "15000",
        DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: "24",
      }),
    ).toMatchObject({
      DOCUMENT_SCANNER_HOST: "clamav",
      DOCUMENT_SCANNER_PORT: 3310,
      DOCUMENT_SCANNER_TIMEOUT_MS: 15000,
      DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: 24,
    });
  });

  it("rejects missing, relative, or unsafe scanner policy values", () => {
    expect(() => parseDocumentEnvironment({})).toThrow(
      "Invalid Documents configuration",
    );
    expect(() =>
      parseDocumentEnvironment({
        DOCUMENT_STORAGE_ROOT: "relative/uploads",
        DOCUMENT_SCANNER_HOST: "clamav",
        DOCUMENT_SCANNER_PORT: "3310",
        DOCUMENT_SCANNER_TIMEOUT_MS: "100",
        DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: "0",
      }),
    ).toThrow();
  });
});
