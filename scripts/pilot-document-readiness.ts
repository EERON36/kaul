import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

import { parseDocumentEnvironment } from "../src/modules/documents/document-environment";
import {
  ClamAvDocumentScanner,
  type DocumentMalwareScanner,
} from "../src/modules/documents/document-malware-scanner";

export async function verifyPilotDocumentReadiness(
  values: Record<string, string | undefined> = process.env,
  createScanner: (
    options: ConstructorParameters<typeof ClamAvDocumentScanner>[0],
  ) => Pick<DocumentMalwareScanner, "scan"> = (options) =>
    new ClamAvDocumentScanner(options),
): Promise<void> {
  const environment = parseDocumentEnvironment(values);
  const root = environment.DOCUMENT_STORAGE_ROOT;
  for (const path of [root, join(root, "objects"), join(root, "quarantine")]) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Documents unavailable.");
    await access(path, constants.R_OK | constants.W_OK | constants.X_OK);
  }
  // Probe only a new owned quarantine file; never modify an accepted object.
  const probe = join(root, "quarantine", `.readiness-${randomUUID()}`);
  const handle = await open(probe, "wx", 0o600);
  try {
    await handle.writeFile("Fictional Kaul readiness probe\n");
  } finally {
    await handle.close();
    await unlink(probe);
  }
  const scanner = createScanner({
    host: environment.DOCUMENT_SCANNER_HOST,
    port: environment.DOCUMENT_SCANNER_PORT,
    timeoutMs: environment.DOCUMENT_SCANNER_TIMEOUT_MS,
    maxSignatureAgeHours: environment.DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS,
  });
  const source = Readable.from(["Fictional Kaul scanner readiness probe\n"]);
  try {
    if ((await scanner.scan(source)).status !== "CLEAN")
      throw new Error("Documents unavailable.");
  } finally {
    source.destroy();
  }
}
