import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const STORAGE_KEY = /^[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const MIGRATION = /^20[0-9]{12}_[a-z0-9_]+$/;
const REQUIRED_MIGRATIONS = [
  "20260903120000_add_client_documents",
  "20260903121000_protect_client_document_lifecycle",
];

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

function sameKeys(value, expectedKeys) {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expectedKeys].sort())
  );
}

function isSorted(values) {
  return values.every(
    (value, index) => index === 0 || values[index - 1] < value,
  );
}

export function parseDocumentBackupMetadata(value) {
  const metadata = requireObject(value);
  if (!sameKeys(metadata, ["migrationNames", "objects"])) {
    throw new DocumentBackupSetError();
  }
  if (
    !Array.isArray(metadata.migrationNames) ||
    metadata.migrationNames.length === 0 ||
    !isSorted(metadata.migrationNames) ||
    !metadata.migrationNames.every(
      (name) => typeof name === "string" && MIGRATION.test(name),
    ) ||
    !REQUIRED_MIGRATIONS.every((name) =>
      metadata.migrationNames.includes(name),
    ) ||
    !Array.isArray(metadata.objects)
  ) {
    throw new DocumentBackupSetError();
  }

  const seen = new Set();
  const objects = metadata.objects.map((candidate) => {
    const object = requireObject(candidate);
    if (
      !sameKeys(object, ["sha256", "sizeBytes", "storageKey"]) ||
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
  if (!isSorted(objects.map((object) => object.storageKey))) {
    throw new DocumentBackupSetError();
  }

  return Object.freeze({
    migrationNames: Object.freeze([...metadata.migrationNames]),
    objects: Object.freeze(objects),
  });
}

export function parseDocumentBackupManifest(value) {
  const manifest = requireObject(value);
  if (
    !sameKeys(manifest, [
      "applicationGitSha",
      "createdAt",
      "format",
      "migrationNames",
      "objects",
      "objectsSnapshotId",
      "postgresqlSnapshotId",
    ]) ||
    manifest.format !== "kaul-document-backup-set-v1" ||
    typeof manifest.applicationGitSha !== "string" ||
    !GIT_SHA.test(manifest.applicationGitSha) ||
    typeof manifest.postgresqlSnapshotId !== "string" ||
    !SHA256.test(manifest.postgresqlSnapshotId) ||
    typeof manifest.objectsSnapshotId !== "string" ||
    !SHA256.test(manifest.objectsSnapshotId) ||
    manifest.postgresqlSnapshotId === manifest.objectsSnapshotId ||
    typeof manifest.createdAt !== "string" ||
    Number.isNaN(Date.parse(manifest.createdAt))
  ) {
    throw new DocumentBackupSetError();
  }
  const metadata = parseDocumentBackupMetadata({
    migrationNames: manifest.migrationNames,
    objects: manifest.objects,
  });
  return Object.freeze({
    format: manifest.format,
    createdAt: manifest.createdAt,
    applicationGitSha: manifest.applicationGitSha,
    migrationNames: metadata.migrationNames,
    postgresqlSnapshotId: manifest.postgresqlSnapshotId,
    objectsSnapshotId: manifest.objectsSnapshotId,
    objects: metadata.objects,
  });
}

export function createDocumentBackupManifest({
  applicationGitSha,
  createdAt,
  metadata: metadataValue,
  objectsSnapshotId,
  postgresqlSnapshotId,
}) {
  const metadata = parseDocumentBackupMetadata(metadataValue);
  return parseDocumentBackupManifest({
    format: "kaul-document-backup-set-v1",
    createdAt,
    applicationGitSha,
    migrationNames: metadata.migrationNames,
    postgresqlSnapshotId,
    objectsSnapshotId,
    objects: metadata.objects,
  });
}

export function serializeDocumentBackupManifest(value) {
  return `${JSON.stringify(parseDocumentBackupManifest(value))}\n`;
}

export function verifyDocumentBackupMetadata(manifestValue, metadataValue) {
  const manifest = parseDocumentBackupManifest(manifestValue);
  const metadata = parseDocumentBackupMetadata(metadataValue);
  if (
    JSON.stringify(manifest.migrationNames) !==
      JSON.stringify(metadata.migrationNames) ||
    JSON.stringify(manifest.objects) !== JSON.stringify(metadata.objects)
  ) {
    throw new DocumentBackupSetError();
  }
  return Object.freeze({ objectCount: manifest.objects.length });
}

export function verifyResticObjectsCatalog(
  manifestOrMetadataValue,
  snapshotId,
  jsonLines,
) {
  if (
    typeof snapshotId !== "string" ||
    !SHA256.test(snapshotId) ||
    typeof jsonLines !== "string"
  ) {
    throw new DocumentBackupSetError();
  }
  const candidate = requireObject(manifestOrMetadataValue);
  const metadata =
    "format" in candidate
      ? parseDocumentBackupManifest(candidate)
      : parseDocumentBackupMetadata(candidate);
  const messages = jsonLines
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return requireObject(JSON.parse(line));
      } catch {
        throw new DocumentBackupSetError();
      }
    });
  const snapshots = messages.filter(
    (message) => message.message_type === "snapshot",
  );
  const nodes = messages.filter((message) => message.struct_type === "node");
  if (
    messages.length !== snapshots.length + nodes.length ||
    snapshots.length !== 1 ||
    snapshots[0].id !== snapshotId ||
    nodes.length !== metadata.objects.length + 1
  ) {
    throw new DocumentBackupSetError();
  }
  const root = nodes.find((node) => node.path === "/objects");
  if (!root || root.type !== "dir") throw new DocumentBackupSetError();
  const expected = new Map(
    metadata.objects.map((object) => [
      `/objects/${object.storageKey}`,
      object.sizeBytes,
    ]),
  );
  const files = nodes.filter((node) => node !== root);
  if (
    files.some(
      (node) =>
        node.type !== "file" ||
        !expected.has(node.path) ||
        expected.get(node.path) !== node.size,
    ) ||
    new Set(files.map((node) => node.path)).size !== expected.size
  ) {
    throw new DocumentBackupSetError();
  }
  return Object.freeze({ objectCount: metadata.objects.length, snapshotId });
}

export function verifyResticManifestCatalog(snapshotId, jsonLines) {
  if (
    typeof snapshotId !== "string" ||
    !SHA256.test(snapshotId) ||
    typeof jsonLines !== "string"
  ) {
    throw new DocumentBackupSetError();
  }
  const messages = jsonLines
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return requireObject(JSON.parse(line));
      } catch {
        throw new DocumentBackupSetError();
      }
    });
  const snapshots = messages.filter(
    (message) => message.message_type === "snapshot",
  );
  const nodes = messages.filter((message) => message.struct_type === "node");
  if (
    messages.length !== 2 ||
    snapshots.length !== 1 ||
    snapshots[0].id !== snapshotId ||
    nodes.length !== 1 ||
    nodes[0].path !== "/kaul-document-backup-set.json" ||
    nodes[0].type !== "file" ||
    !Number.isSafeInteger(nodes[0].size) ||
    nodes[0].size < 1
  ) {
    throw new DocumentBackupSetError();
  }
  return Object.freeze({ snapshotId });
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
