import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DocumentStorageError,
  FileSystemDocumentStorage,
} from "./document-storage";

const roots: string[] = [];

async function storageFixture() {
  const root = await mkdtemp(join(tmpdir(), "kaul-documents-"));
  roots.push(resolve(root));
  return { root, storage: new FileSystemDocumentStorage(resolve(root)) };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

describe("filesystem Document storage", () => {
  it("writes quarantine exclusively, promotes to an opaque immutable key, and opens it", async () => {
    const { root, storage } = await storageFixture();
    const source = (async function* () {
      yield Buffer.from("fictional content");
    })();
    const quarantineKey = await storage.putQuarantine(source);
    expect(quarantineKey).toMatch(/^[0-9a-f]{64}$/);
    const storageKey = "a".repeat(64);
    await storage.promote(quarantineKey, storageKey);
    expect(await storage.exists(storageKey)).toBe(true);
    expect(await readFile(join(root, "objects", storageKey), "utf8")).toBe(
      "fictional content",
    );
    const handle = await storage.open(storageKey);
    expect(handle.size).toBe(17);
    await handle.close();
  });

  it("reopens an existing root and initialises concurrent uploads safely", async () => {
    const { root, storage } = await storageFixture();
    const firstKey = await storage.putQuarantine(
      (async function* () {
        yield Buffer.from("first");
      })(),
    );
    await storage.removeQuarantine(firstKey);

    const reopened = new FileSystemDocumentStorage(resolve(root));
    const keys = await Promise.all(
      ["second", "third"].map((value) =>
        reopened.putQuarantine(
          (async function* () {
            yield Buffer.from(value);
          })(),
        ),
      ),
    );
    expect(new Set(keys).size).toBe(2);
    await Promise.all(keys.map((key) => reopened.removeQuarantine(key)));
  });

  it("rejects traversal, separators, malformed keys, and overwrite collisions", async () => {
    const { storage } = await storageFixture();
    for (const key of [
      "../object",
      "..\\object",
      "a/b",
      "a\\b",
      "CON",
      "a".repeat(63),
      "g".repeat(64),
    ]) {
      await expect(storage.open(key)).rejects.toBeInstanceOf(
        DocumentStorageError,
      );
    }
    const first = await storage.putQuarantine(
      (async function* () {
        yield Buffer.from("first");
      })(),
    );
    await storage.promote(first, "b".repeat(64));
    const second = await storage.putQuarantine(
      (async function* () {
        yield Buffer.from("second");
      })(),
    );
    await expect(
      storage.promote(second, "b".repeat(64)),
    ).rejects.toBeInstanceOf(DocumentStorageError);
    const handle = await storage.open("b".repeat(64));
    expect(handle.size).toBe(5);
    await handle.close();
  });

  it("refuses symlinks and non-regular objects", async () => {
    const { root, storage } = await storageFixture();
    const initial = await storage.putQuarantine(
      (async function* () {
        yield Buffer.from("initial");
      })(),
    );
    await storage.removeQuarantine(initial);
    await mkdir(join(root, "objects"), { recursive: true });
    const target = join(root, "target.txt");
    await writeFile(target, "target");
    const key = "c".repeat(64);
    try {
      await symlink(target, join(root, "objects", key));
    } catch {
      return;
    }
    await expect(storage.open(key)).rejects.toBeInstanceOf(
      DocumentStorageError,
    );
  });
});
