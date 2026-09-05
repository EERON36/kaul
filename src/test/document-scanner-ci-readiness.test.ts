import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { MalwareScanResult } from "../modules/documents/document-malware-scanner";
import { waitForDocumentScannerReadiness } from "./document-scanner-ci-readiness";

const execFileAsync = promisify(execFile);

const cleanResult: MalwareScanResult = {
  status: "CLEAN",
  evidence: {
    result: "CLEAN",
    scanner: "ClamAV",
    scannerVersion: "1.4.6",
    signatureVersion: "fictional",
    signatureDate: new Date("2032-01-01T00:00:00.000Z"),
    scannedAt: new Date("2032-01-01T00:00:01.000Z"),
  },
};

function ciEnvironment() {
  return {
    GITHUB_ACTIONS: "true",
    CI: "true",
    DEPLOYMENT_ENV: "test",
    KAUL_TEST_ID: "ci",
    KAUL_TEST_PORT: "3101",
    DATABASE_URL: "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_ci",
    INTEGRATION_DATABASE_URL:
      "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_ci",
    BETTER_AUTH_URL: "http://127.0.0.1:3101",
    DOCUMENT_STORAGE_ROOT: resolve("tmp", "fictional-document-storage"),
    DOCUMENT_SCANNER_HOST: "127.0.0.1",
    DOCUMENT_SCANNER_PORT: "3310",
    DOCUMENT_SCANNER_TIMEOUT_MS: "15000",
    DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: "24",
  };
}

describe("document scanner CI readiness", () => {
  it("refuses non-CI execution before constructing a scanner", async () => {
    const createScanner = vi.fn();
    await expect(
      waitForDocumentScannerReadiness(
        { ...ciEnvironment(), GITHUB_ACTIONS: "false" },
        {
          createScanner,
          wait: vi.fn(),
        },
      ),
    ).rejects.toThrow();
    expect(createScanner).not.toHaveBeenCalled();
  });

  it("refuses a non-loopback scanner before constructing a scanner", async () => {
    const createScanner = vi.fn();
    await expect(
      waitForDocumentScannerReadiness(
        {
          ...ciEnvironment(),
          DOCUMENT_SCANNER_HOST: "scanner.example.test",
        },
        {
          createScanner,
          wait: vi.fn(),
        },
      ),
    ).rejects.toThrow();
    expect(createScanner).not.toHaveBeenCalled();
  });
  it("retries unavailable scans and accepts only the real clean result", async () => {
    const scan = vi
      .fn()
      .mockRejectedValueOnce(new Error("first unavailable"))
      .mockRejectedValueOnce(new Error("second unavailable"))
      .mockResolvedValueOnce(cleanResult);
    const wait = vi.fn(async () => undefined);
    const createScanner = vi.fn(() => ({ scan }));

    await expect(
      waitForDocumentScannerReadiness(ciEnvironment(), {
        createScanner,
        wait,
      }),
    ).resolves.toBe(true);

    expect(createScanner).toHaveBeenCalledOnce();
    expect(createScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        DOCUMENT_SCANNER_HOST: "127.0.0.1",
        DOCUMENT_SCANNER_TIMEOUT_MS: 15_000,
        DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: 24,
      }),
    );
    expect(scan).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 5_000);
    expect(wait).toHaveBeenNthCalledWith(2, 5_000);
  });

  it("fails after three unavailable attempts", async () => {
    const scan = vi.fn().mockRejectedValue(new Error("unavailable"));
    const wait = vi.fn(async () => undefined);
    const createScanner = vi.fn(() => ({ scan }));

    await expect(
      waitForDocumentScannerReadiness(ciEnvironment(), {
        createScanner,
        wait,
      }),
    ).resolves.toBe(false);

    expect(scan).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("fails immediately when fictional content is rejected", async () => {
    const scan = vi
      .fn()
      .mockResolvedValue({ status: "REJECTED", detected: true });
    const wait = vi.fn(async () => undefined);
    const createScanner = vi.fn(() => ({ scan }));

    await expect(
      waitForDocumentScannerReadiness(ciEnvironment(), {
        createScanner,
        wait,
      }),
    ).resolves.toBe(false);

    expect(scan).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it("reports only the fixed failure label from the CLI guard", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          resolve("scripts", "document-scanner-ci-readiness.ts"),
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            GITHUB_ACTIONS: "false",
            CI: "false",
            DEPLOYMENT_ENV: "test",
          },
          timeout: 5_000,
        },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stdout: "",
      stderr: "DOCUMENT_SCANNER_NOT_READY\n",
    });
  });
});
