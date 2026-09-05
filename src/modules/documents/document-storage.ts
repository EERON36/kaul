import "server-only";

import { constants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";

const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{64}$/;

export class DocumentStorageError extends Error {
  constructor() {
    super("Document storage requirement not satisfied.");
    Object.defineProperty(this, "name", {
      value: "DocumentStorageError",
      configurable: true,
    });
  }
}

export type DocumentObjectHandle = Readonly<{
  size: number;
  createReadStream: () => Readable;
  close: () => Promise<void>;
}>;

export interface DocumentStorage {
  putQuarantine(source: AsyncIterable<Uint8Array>): Promise<string>;
  openQuarantine(quarantineKey: string): Promise<DocumentObjectHandle>;
  promote(quarantineKey: string, storageKey: string): Promise<void>;
  open(storageKey: string): Promise<DocumentObjectHandle>;
  stat(storageKey: string): Promise<Readonly<{ size: number }>>;
  exists(storageKey: string): Promise<boolean>;
  removeUnreferenced(storageKey: string): Promise<void>;
  removeQuarantine(quarantineKey: string): Promise<void>;
}

function requireStorageKey(value: string): string {
  if (!STORAGE_KEY_PATTERN.test(value)) throw new DocumentStorageError();
  return value;
}

function isContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

async function requireRegularDirectory(path: string): Promise<void> {
  const value = await lstat(path);
  if (!value.isDirectory() || value.isSymbolicLink()) {
    throw new DocumentStorageError();
  }
}

export class FileSystemDocumentStorage implements DocumentStorage {
  readonly #configuredRoot: string;
  #root: string | null = null;
  #objects: string | null = null;
  #quarantine: string | null = null;
  #initialisation: Promise<void> | null = null;

  constructor(root: string) {
    if (!isAbsolute(root)) throw new DocumentStorageError();
    this.#configuredRoot = resolve(root);
  }

  async #initialise(): Promise<void> {
    if (this.#root) return;

    this.#initialisation ??= this.#initialiseOnce();
    try {
      await this.#initialisation;
    } catch (error) {
      this.#initialisation = null;
      throw error;
    }
  }

  async #initialiseOnce(): Promise<void> {
    if (this.#root) return;

    await mkdir(this.#configuredRoot, { recursive: true, mode: 0o700 });
    await requireRegularDirectory(this.#configuredRoot);
    const root = await realpath(this.#configuredRoot);
    const objects = join(root, "objects");
    const quarantine = join(root, "quarantine");
    await mkdir(objects, { recursive: true, mode: 0o700 });
    await mkdir(quarantine, { recursive: true, mode: 0o700 });
    await requireRegularDirectory(objects);
    await requireRegularDirectory(quarantine);
    if (!isContained(root, objects) || !isContained(root, quarantine)) {
      throw new DocumentStorageError();
    }
    this.#root = root;
    this.#objects = objects;
    this.#quarantine = quarantine;
  }

  async #path(kind: "objects" | "quarantine", key: string): Promise<string> {
    await this.#initialise();
    const validated = requireStorageKey(key);
    const root = kind === "objects" ? this.#objects : this.#quarantine;
    if (!root) throw new DocumentStorageError();
    const candidate = join(root, validated);
    if (!isContained(root, candidate)) throw new DocumentStorageError();
    return candidate;
  }

  async putQuarantine(source: AsyncIterable<Uint8Array>): Promise<string> {
    const key = randomBytes(32).toString("hex");
    const path = await this.#path("quarantine", key);
    let handle;
    try {
      handle = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | O_NOFOLLOW,
        0o600,
      );
    } catch {
      throw new DocumentStorageError();
    }
    try {
      for await (const chunk of source) {
        let offset = 0;
        while (offset < chunk.byteLength) {
          let bytesWritten: number;
          try {
            ({ bytesWritten } = await handle.write(
              chunk,
              offset,
              chunk.byteLength - offset,
            ));
          } catch {
            throw new DocumentStorageError();
          }
          if (bytesWritten < 1) throw new DocumentStorageError();
          offset += bytesWritten;
        }
      }
      await handle.sync();
      await handle.close();
      return key;
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  async #open(kind: "objects" | "quarantine", key: string) {
    const path = await this.#path(kind, key);
    try {
      const before = await lstat(path);
      if (!before.isFile() || before.isSymbolicLink()) {
        throw new DocumentStorageError();
      }
      const handle = await open(path, constants.O_RDONLY | O_NOFOLLOW);
      const after = await handle.stat();
      if (
        !after.isFile() ||
        before.dev !== after.dev ||
        before.ino !== after.ino
      ) {
        await handle.close();
        throw new DocumentStorageError();
      }
      return {
        size: after.size,
        createReadStream: () =>
          handle.createReadStream({ autoClose: false, start: 0 }),
        close: () => handle.close(),
      } satisfies DocumentObjectHandle;
    } catch (error) {
      if (error instanceof DocumentStorageError) throw error;
      throw new DocumentStorageError();
    }
  }

  openQuarantine(quarantineKey: string): Promise<DocumentObjectHandle> {
    return this.#open("quarantine", quarantineKey);
  }

  open(storageKey: string): Promise<DocumentObjectHandle> {
    return this.#open("objects", storageKey);
  }

  async promote(quarantineKey: string, storageKey: string): Promise<void> {
    const source = await this.#path("quarantine", quarantineKey);
    const destination = await this.#path("objects", storageKey);
    const sourceStat = await lstat(source).catch(() => null);
    if (!sourceStat?.isFile() || sourceStat.isSymbolicLink()) {
      throw new DocumentStorageError();
    }
    let linked = false;
    try {
      await chmod(source, 0o400);
      await link(source, destination);
      linked = true;
      await unlink(source);
    } catch {
      if (linked) await unlink(destination).catch(() => undefined);
      throw new DocumentStorageError();
    }
  }

  async stat(storageKey: string): Promise<Readonly<{ size: number }>> {
    const handle = await this.open(storageKey);
    try {
      return { size: handle.size };
    } finally {
      await handle.close();
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const path = await this.#path("objects", storageKey);
    try {
      const value = await lstat(path);
      if (!value.isFile() || value.isSymbolicLink()) {
        throw new DocumentStorageError();
      }
      return true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return false;
      }
      if (error instanceof DocumentStorageError) throw error;
      throw new DocumentStorageError();
    }
  }

  async removeUnreferenced(storageKey: string): Promise<void> {
    const path = await this.#path("objects", storageKey);
    try {
      const value = await lstat(path);
      if (!value.isFile() || value.isSymbolicLink()) {
        throw new DocumentStorageError();
      }
      await unlink(path);
    } catch {
      throw new DocumentStorageError();
    }
  }

  async removeQuarantine(quarantineKey: string): Promise<void> {
    const path = await this.#path("quarantine", quarantineKey);
    try {
      const value = await lstat(path);
      if (!value.isFile() || value.isSymbolicLink()) {
        throw new DocumentStorageError();
      }
      await unlink(path);
    } catch {
      throw new DocumentStorageError();
    }
  }
}

export function generateDocumentStorageKey(): string {
  return randomBytes(32).toString("hex");
}
