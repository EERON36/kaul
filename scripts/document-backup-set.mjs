#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import {
  createDocumentBackupManifest,
  DocumentBackupSetError,
  parseDocumentBackupManifest,
  serializeDocumentBackupManifest,
  verifyDocumentBackupMetadata,
  verifyDocumentBackupSet,
  verifyResticManifestCatalog,
  verifyResticObjectsCatalog,
} from "./document-backup-set-core.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "verify" && args.length === 2) {
    const result = await verifyDocumentBackupSet(
      await readJson(args[0]),
      args[1],
    );
    process.stdout.write(
      `Document backup set verified: ${result.objectCount} immutable object(s).\n`,
    );
    return;
  }
  if (command === "verify-metadata" && args.length === 2) {
    verifyDocumentBackupMetadata(
      await readJson(args[0]),
      await readJson(args[1]),
    );
    return;
  }
  if (command === "verify-catalog" && args.length === 3) {
    verifyResticObjectsCatalog(
      await readJson(args[0]),
      args[1],
      await readFile(args[2], "utf8"),
    );
    return;
  }
  if (command === "verify-manifest-catalog" && args.length === 2) {
    verifyResticManifestCatalog(args[0], await readFile(args[1], "utf8"));
    return;
  }
  if (command === "create" && args.length === 5) {
    const [
      metadataPath,
      applicationGitSha,
      postgresqlSnapshotId,
      objectsSnapshotId,
      createdAt,
    ] = args;
    process.stdout.write(
      serializeDocumentBackupManifest(
        createDocumentBackupManifest({
          applicationGitSha,
          createdAt,
          metadata: await readJson(metadataPath),
          objectsSnapshotId,
          postgresqlSnapshotId,
        }),
      ),
    );
    return;
  }
  if (command === "get" && args.length === 2) {
    const manifest = parseDocumentBackupManifest(await readJson(args[0]));
    if (!["objectsSnapshotId", "postgresqlSnapshotId"].includes(args[1])) {
      throw new DocumentBackupSetError();
    }
    process.stdout.write(`${manifest[args[1]]}\n`);
    return;
  }
  throw new DocumentBackupSetError(
    "Usage: document-backup-set.mjs <verify|verify-metadata|verify-catalog|create|get> ...",
  );
}

main().catch((error) => {
  process.stderr.write(
    `${
      error instanceof DocumentBackupSetError
        ? error.message
        : "Document backup-set verification failed."
    }\n`,
  );
  process.exitCode = 1;
});
