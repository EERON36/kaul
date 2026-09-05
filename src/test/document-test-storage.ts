import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getTestDatabaseName } from "./test-environment";

const OWNER_FILE = ".kaul-document-test-owner";

export type OwnedDocumentTestStorage = Readonly<{
  root: string;
  dispose(): Promise<void>;
}>;

export function getDocumentTestStorageRoot(testId: string): string {
  getTestDatabaseName(testId);
  // Runtime DOCUMENT_STORAGE_ROOT is deliberately not a test cleanup target.
  return join(realpathSync(tmpdir()), `kaul-documents-e2e-${testId}`);
}

export async function createDocumentTestStorage(
  testId: string,
): Promise<OwnedDocumentTestStorage> {
  const root = getDocumentTestStorageRoot(testId);
  try {
    // Existing files, directories, and symlinks belong to someone else.
    await mkdir(root, { mode: 0o700 });
  } catch {
    throw new Error(
      "Documents test storage must be a fresh task directory; preserve existing storage and use a new KAUL_TEST_ID.",
    );
  }

  const identity = await lstat(root);
  const ownerPath = join(root, OWNER_FILE);
  const owner = randomUUID();
  await writeFile(ownerPath, owner, { flag: "wx", mode: 0o600 });
  // The dev server can retain its storage adapter across a retried worker.
  await mkdir(join(root, "objects"), { mode: 0o700 });
  await mkdir(join(root, "quarantine"), { mode: 0o700 });
  let disposed = false;

  return Object.freeze({
    root,
    async dispose() {
      if (disposed) return;
      const current = await lstat(root).catch(() => null);
      const marker = await lstat(ownerPath).catch(() => null);
      if (
        root !== getDocumentTestStorageRoot(testId) ||
        !current?.isDirectory() ||
        current.isSymbolicLink() ||
        current.dev !== identity.dev ||
        current.ino !== identity.ino ||
        (await realpath(root).catch(() => null)) !== root ||
        !marker?.isFile() ||
        marker.isSymbolicLink() ||
        (await readFile(ownerPath, "utf8").catch(() => null)) !== owner
      ) {
        throw new Error(
          "Documents test storage ownership changed; refusing cleanup.",
        );
      }
      await rm(root, { recursive: true });
      disposed = true;
    },
  });
}
