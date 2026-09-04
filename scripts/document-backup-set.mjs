#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import {
  DocumentBackupSetError,
  verifyDocumentBackupSet,
} from "./document-backup-set-core.mjs";

async function main() {
  const [command, manifestPath, storageRoot] = process.argv.slice(2);
  if (command !== "verify" || !manifestPath || !storageRoot) {
    throw new DocumentBackupSetError(
      "Usage: document-backup-set.mjs verify <manifest.json> <absolute-storage-root>",
    );
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const result = await verifyDocumentBackupSet(manifest, storageRoot);
  process.stdout.write(
    `Document backup set verified: ${result.objectCount} immutable object(s).\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof DocumentBackupSetError ? error.message : "Document backup-set verification failed."}\n`,
  );
  process.exitCode = 1;
});
