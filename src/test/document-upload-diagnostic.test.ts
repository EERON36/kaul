import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  replaceDiagnosticFileAtomically,
  sanitizeDocumentUploadDiagnostic,
} from "./document-upload-diagnostic";

describe("document upload CI diagnostic sanitization", () => {
  it("retains only an allowlisted application code and bounded status", () => {
    expect(
      sanitizeDocumentUploadDiagnostic(503, {
        code: "DOCUMENT_SERVICE_UNAVAILABLE",
        path: "/private/quarantine/example",
        scannerDetail: "internal detail",
        requestBody: "fictional body",
      }),
    ).toEqual({
      httpStatus: 503,
      applicationCode: "DOCUMENT_SERVICE_UNAVAILABLE",
    });
  });

  it.each([
    [500, { code: "INTERNAL_SCANNER_ERROR", secret: "fictional-secret" }, 500],
    [201, { documentId: "fictional-id", extra: ["arbitrary"] }, 201],
    [404, null, 404],
  ])(
    "maps unknown or missing payload data to a stable code",
    (status, payload, expectedStatus) => {
      expect(sanitizeDocumentUploadDiagnostic(status, payload)).toEqual({
        httpStatus: expectedStatus,
        applicationCode:
          expectedStatus === 201 ? "UPLOAD_ACCEPTED" : "UNEXPECTED_RESPONSE",
      });
    },
  );

  it.each([99, 600, -1, Number.NaN, 201.5, "503", null])(
    "does not retain an invalid HTTP status",
    (status) => {
      expect(sanitizeDocumentUploadDiagnostic(status, null)).toEqual({
        httpStatus: null,
        applicationCode: "NO_RESPONSE",
      });
    },
  );
});
describe("document upload CI diagnostic persistence", () => {
  it("atomically replaces prior evidence without leaving a temporary file", async () => {
    const directory = await mkdtemp(
      resolve(tmpdir(), "kaul-upload-diagnostic-"),
    );
    const targetPath = resolve(directory, "diagnostic.json");
    try {
      await writeFile(targetPath, "initial evidence\n", "utf8");
      await replaceDiagnosticFileAtomically(
        targetPath,
        "replacement evidence\n",
      );

      await expect(readFile(targetPath, "utf8")).resolves.toBe(
        "replacement evidence\n",
      );
      await expect(readdir(directory)).resolves.toEqual(["diagnostic.json"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves prior evidence when the temporary write fails", async () => {
    const directory = await mkdtemp(
      resolve(tmpdir(), "kaul-upload-diagnostic-"),
    );
    const targetPath = resolve(directory, "diagnostic.json");
    const unavailableTemporaryPath = resolve(
      directory,
      "missing",
      "diagnostic.tmp",
    );
    try {
      await writeFile(targetPath, "initial evidence\n", "utf8");
      await expect(
        replaceDiagnosticFileAtomically(
          targetPath,
          "replacement evidence\n",
          unavailableTemporaryPath,
        ),
      ).rejects.toThrow();
      await expect(readFile(targetPath, "utf8")).resolves.toBe(
        "initial evidence\n",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
