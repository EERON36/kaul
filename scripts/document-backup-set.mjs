#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const STORAGE_KEY = /^[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const MIGRATION = /^20[0-9]{12}_[a-z0-9_]+$/;

export class DocumentBackupSetError extends Error {
  constructor(message = "Document backup-set verification failed.") {
    super(message);
    this.name = "DocumentBackupSetError";
  }
}

function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DocumentBackupSetError();
  }
  return value;
}

export function parseDocumentBackupManifest(value) {
  const manifest = requireObject(value);
  const keys = Object.keys(manifest).sort();
  const expectedKeys = [
    "applicationGitSha",
    "createdAt",
    "format",
    "migrationNames",
    "objects",
    "objectsSnapshotId",
    "postgresqlSnapshotId",
  ].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new DocumentBackupSetError();
  }
  if (
    manifest.format !== "kaul-document-backup-set-v1" ||
    !GIT_SHA.test(manifest.applicationGitSha) ||
    !SHA256.test(manifest.postgresqlSnapshotId) ||
    !SHA256.test(manifest.objectsSnapshotId) ||
    typeof manifest.createdAt !== "string" ||
    Number.isNaN(Date.parse(manifest.createdAt)) ||
    !Array.isArray(manifest.migrationNames) ||
    manifest.migrationNames.length === 0 ||
    new Set(manifest.migrationNames).size !== manifest.migrationNames.length ||
    !manifest.migrationNames.every(
      (name) => typeof name === "string" && MIGRATION.test(name),
    ) ||
    !manifest.migrationNames.includes("20260903120000_add_client_documents") ||
    !manifest.migrationNames.includes(
      "20260903121000_protect_client_document_lifecycle",
    ) ||
    !Array.isArray(manifest.objects)
  ) {
    throw new DocumentBackupSetError();
  }

  const seen = new Set();
  const objects = manifest.objects.map((candidate) => {
    const object = requireObject(candidate);
    if (
      Object.keys(object).sort().join(",") !== "sha256,sizeBytes,storageKey" ||
      typeof object.storageKey !== "string" ||
      !STORAGE_KEY.test(object.storageKey) ||
      !Number.isSafeInteger(object.sizeBytes) ||
      object.sizeBytes < 1 ||
      object.sizeBytes > 25 * 1024 * 1024 ||
      typeof object.sha256 !== "string" ||
      !SHA256.test(object.sha256) ||
      seen.has(object.storageKey)
    ) {
      throw new DocumentBackupSetError();
    }
    seen.add(object.storageKey);
    return Object.freeze({
      storageKey: object.storageKey,
      sizeBytes: object.sizeBytes,
      sha256: object.sha256,
    });
  });

  return Object.freeze({
    format: manifest.format,
    createdAt: manifest.createdAt,
    applicationGitSha: manifest.applicationGitSha,
    migrationNames: Object.freeze([...manifest.migrationNames]),
    postgresqlSnapshotId: manifest.postgresqlSnapshotId,
    objectsSnapshotId: manifest.objectsSnapshotId,
    objects: Object.freeze(objects),
  });
}

function isContained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot.length > 0 &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

async function digestRegularFile(path, expectedSize) {
  const before = await lstat(path).catch(() => null);
  if (
    !before?.isFile() ||
    before.isSymbolicLink() ||
    before.size !== expectedSize
  ) {
    throw new DocumentBackupSetError();
  }
  const digest = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    digest.update(chunk);
  }
  const after = await lstat(path).catch(() => null);
  if (
    !after?.isFile() ||
    after.isSymbolicLink() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    size !== expectedSize
  ) {
    throw new DocumentBackupSetError();
  }
  return digest.digest("hex");
}

export async function verifyDocumentBackupSet(manifestValue, storageRoot) {
  const manifest = parseDocumentBackupManifest(manifestValue);
  if (!isAbsolute(storageRoot)) throw new DocumentBackupSetError();
  const root = await realpath(resolve(storageRoot)).catch(() => null);
  if (!root) throw new DocumentBackupSetError();
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new DocumentBackupSetError();
  }
  const objectsRoot = join(root, "objects");
  if (!isContained(root, objectsRoot)) throw new DocumentBackupSetError();
  const objectsStat = await lstat(objectsRoot).catch(() => null);
  if (!objectsStat?.isDirectory() || objectsStat.isSymbolicLink()) {
    throw new DocumentBackupSetError();
  }

  const entries = await readdir(objectsRoot, { withFileTypes: true });
  if (
    entries.length !== manifest.objects.length ||
    entries.some(
      (entry) =>
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !STORAGE_KEY.test(entry.name),
    )
  ) {
    throw new DocumentBackupSetError();
  }
  const actualKeys = new Set(entries.map((entry) => entry.name));
  if (manifest.objects.some((object) => !actualKeys.has(object.storageKey))) {
    throw new DocumentBackupSetError();
  }
  for (const object of manifest.objects) {
    const path = join(objectsRoot, object.storageKey);
    if (!isContained(objectsRoot, path)) throw new DocumentBackupSetError();
    const digest = await digestRegularFile(path, object.sizeBytes);
    if (digest !== object.sha256) throw new DocumentBackupSetError();
  }

  return Object.freeze({
    objectCount: manifest.objects.length,
    postgresqlSnapshotId: manifest.postgresqlSnapshotId,
    objectsSnapshotId: manifest.objectsSnapshotId,
  });
}

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

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof DocumentBackupSetError ? error.message : "Document backup-set verification failed."}\n`,
    );
    process.exitCode = 1;
  });
}
