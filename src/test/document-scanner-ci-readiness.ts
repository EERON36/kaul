import "server-only";

import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { setTimeout as wait } from "node:timers/promises";

import {
  ClamAvDocumentScanner,
  type DocumentMalwareScanner,
} from "../modules/documents/document-malware-scanner";
import {
  parseDocumentEnvironment,
  type DocumentEnvironment,
} from "../modules/documents/document-environment";
import { getTestEnvironment } from "./test-environment";

type ReadinessEnvironmentValues = Record<string, string | undefined>;

type ReadinessDependencies = Readonly<{
  createScanner: (
    environment: DocumentEnvironment,
  ) => Pick<DocumentMalwareScanner, "scan">;
  wait: (milliseconds: number) => Promise<unknown>;
}>;

const attempts = 3;
const delayMilliseconds = 5_000;
const fictionalDocument = Buffer.from(
  "Fiktivt KAUL dokument for virusskannerkontroll\n",
  "utf8",
);

const defaultDependencies: ReadinessDependencies = {
  createScanner: (environment) =>
    new ClamAvDocumentScanner({
      host: environment.DOCUMENT_SCANNER_HOST,
      port: environment.DOCUMENT_SCANNER_PORT,
      timeoutMs: environment.DOCUMENT_SCANNER_TIMEOUT_MS,
      maxSignatureAgeHours: environment.DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS,
    }),
  wait,
};

function requireCiEnvironment(
  values: ReadinessEnvironmentValues,
): DocumentEnvironment {
  if (
    values.GITHUB_ACTIONS !== "true" ||
    values.CI !== "true" ||
    values.DEPLOYMENT_ENV !== "test"
  ) {
    throw new Error();
  }

  const testEnvironment = getTestEnvironment(values);
  if (testEnvironment.testId !== "ci") throw new Error();

  const environment = parseDocumentEnvironment(values);
  if (
    environment.DOCUMENT_SCANNER_HOST !== "127.0.0.1" &&
    environment.DOCUMENT_SCANNER_HOST !== "localhost"
  ) {
    throw new Error();
  }

  return environment;
}

export async function waitForDocumentScannerReadiness(
  values: ReadinessEnvironmentValues = process.env,
  dependencies: ReadinessDependencies = defaultDependencies,
): Promise<boolean> {
  const environment = requireCiEnvironment(values);
  const scanner = dependencies.createScanner(environment);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await scanner.scan(Readable.from([fictionalDocument]));
      return result.status === "CLEAN";
    } catch {
      if (attempt === attempts) return false;
      await dependencies.wait(delayMilliseconds);
    }
  }

  return false;
}
