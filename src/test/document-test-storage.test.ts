import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSystemDocumentStorage } from "../modules/documents/document-storage";

import {
  createDocumentTestStorage,
  getDocumentTestStorageRoot,
} from "./document-test-storage";

const fixtureRoots: string[] = [];
const temporaryRoot = realpathSync(tmpdir());

function testId() {
  return `storage_${randomUUID().replaceAll("-", "")}`;
}

async function ownedStorage() {
  const id = testId();
  const storage = await createDocumentTestStorage(id);
  fixtureRoots.push(storage.root);
  return { id, storage };
}

async function sentinelDirectory(id = testId()) {
  const root = getDocumentTestStorageRoot(id);
  await mkdir(root);
  fixtureRoots.push(root);
  await writeFile(join(root, "sentinel.txt"), "preserve fictional content");
  return { id, root };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of fixtureRoots.splice(0).reverse()) {
    // Only paths exclusively created by these tests enter this list.
    expect(dirname(root)).toBe(temporaryRoot);
    expect(
      root.startsWith(join(temporaryRoot, "kaul-documents-e2e-storage_")),
    ).toBe(true);
    await rm(root, { recursive: true, force: true });
  }
});

describe("Documents browser-test storage ownership", () => {
  it("gives the Playwright server the same task root despite runtime storage settings", async () => {
    const unrelated = await sentinelDirectory();
    const id = testId();
    vi.stubEnv("KAUL_TEST_ID", id);
    vi.stubEnv("KAUL_TEST_PORT", "3199");
    vi.stubEnv(
      "DATABASE_URL",
      `postgresql://fictional:fictional@127.0.0.1:5432/kaul_test_${id}`,
    );
    vi.stubEnv(
      "INTEGRATION_DATABASE_URL",
      `postgresql://fictional:fictional@127.0.0.1:5432/kaul_test_${id}`,
    );
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3199");
    vi.stubEnv("DOCUMENT_STORAGE_ROOT", unrelated.root);
    const config = (await import("../../playwright.config")).default;
    const webServer = config.webServer;
    if (!webServer || Array.isArray(webServer))
      throw new Error("Expected one test server.");
    expect(webServer.env?.DOCUMENT_STORAGE_ROOT).toBe(
      getDocumentTestStorageRoot(id),
    );
    await expect(lstat(getDocumentTestStorageRoot(id))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(join(unrelated.root, "sentinel.txt"), "utf8")).toBe(
      "preserve fictional content",
    );
  });

  it("uses one derived task root and ignores ambient runtime storage", async () => {
    const unrelated = await sentinelDirectory();
    vi.stubEnv("DOCUMENT_STORAGE_ROOT", unrelated.root);
    const { id, storage } = await ownedStorage();
    expect(storage.root).toBe(getDocumentTestStorageRoot(id));
    expect(storage.root).not.toBe(unrelated.root);
    await writeFile(join(storage.root, "fictional-object"), "test content");
    await storage.dispose();
    await expect(lstat(storage.root)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(unrelated.root, "sentinel.txt"), "utf8")).toBe(
      "preserve fictional content",
    );
    await expect(storage.dispose()).resolves.toBeUndefined();
  });

  it("supports the server's cached storage adapter after a browser worker retry", async () => {
    const { id, storage } = await ownedStorage();
    const adapter = new FileSystemDocumentStorage(storage.root);
    const previousObject = "a".repeat(64);
    const nextObject = "b".repeat(64);
    const firstQuarantine = await adapter.putQuarantine(
      Readable.from([Buffer.from("previous fictional content")]),
    );
    await adapter.promote(firstQuarantine, previousObject);
    await storage.dispose();

    const retryStorage = await createDocumentTestStorage(id);
    expect(retryStorage.root).toBe(storage.root);
    const nextQuarantine = await adapter.putQuarantine(
      Readable.from([Buffer.from("retried fictional content")]),
    );
    await adapter.promote(nextQuarantine, nextObject);
    expect(await adapter.exists(previousObject)).toBe(false);
    expect(await adapter.exists(nextObject)).toBe(true);
    await retryStorage.dispose();
  });

  it("refuses an existing task directory without changing its files", async () => {
    const { id, root } = await sentinelDirectory();
    await expect(createDocumentTestStorage(id)).rejects.toThrow(
      "fresh task directory",
    );
    expect(await readdir(root)).toEqual(["sentinel.txt"]);
    expect(await readFile(join(root, "sentinel.txt"), "utf8")).toBe(
      "preserve fictional content",
    );
  });

  it("refuses an existing file at the task path", async () => {
    const id = testId();
    const root = getDocumentTestStorageRoot(id);
    await writeFile(root, "preserve fictional file", { flag: "wx" });
    fixtureRoots.push(root);
    await expect(createDocumentTestStorage(id)).rejects.toThrow(
      "fresh task directory",
    );
    expect(await readFile(root, "utf8")).toBe("preserve fictional file");
  });

  it("refuses an existing directory link without touching its target", async () => {
    const target = await sentinelDirectory();
    const id = testId();
    const root = getDocumentTestStorageRoot(id);
    await symlink(target.root, root, "junction");
    fixtureRoots.push(root);
    await expect(createDocumentTestStorage(id)).rejects.toThrow(
      "fresh task directory",
    );
    expect(await readFile(join(target.root, "sentinel.txt"), "utf8")).toBe(
      "preserve fictional content",
    );
  });

  it.each(["missing", "changed"])(
    "preserves files when the ownership marker is %s",
    async (change) => {
      const { storage } = await ownedStorage();
      const ownerFile = ".kaul-document-test-owner";
      const marker = join(storage.root, ownerFile);
      await writeFile(join(storage.root, "sentinel.txt"), "preserve this file");
      if (change === "missing") await rm(marker);
      else await writeFile(marker, "another owner");
      await expect(storage.dispose()).rejects.toThrow("refusing cleanup");
      expect(await readFile(join(storage.root, "sentinel.txt"), "utf8")).toBe(
        "preserve this file",
      );
    },
  );

  it("refuses a replacement directory even with a copied ownership marker", async () => {
    const { storage } = await ownedStorage();
    const ownerFile = ".kaul-document-test-owner";
    const marker = await readFile(join(storage.root, ownerFile));
    const movedRoot = `${storage.root}-moved`;
    await rename(storage.root, movedRoot);
    fixtureRoots.push(movedRoot);
    await mkdir(storage.root);
    await writeFile(join(storage.root, ownerFile), marker);
    await writeFile(join(storage.root, "sentinel.txt"), "unowned replacement");
    await expect(storage.dispose()).rejects.toThrow("refusing cleanup");
    expect(await readFile(join(storage.root, "sentinel.txt"), "utf8")).toBe(
      "unowned replacement",
    );
    expect((await lstat(movedRoot)).isDirectory()).toBe(true);
  });

  it("refuses a root replaced with a link and preserves the link target", async () => {
    const { storage } = await ownedStorage();
    const target = await sentinelDirectory();
    const movedRoot = `${storage.root}-moved`;
    await rename(storage.root, movedRoot);
    fixtureRoots.push(movedRoot);
    await symlink(target.root, storage.root, "junction");
    await expect(storage.dispose()).rejects.toThrow("refusing cleanup");
    expect(await readFile(join(target.root, "sentinel.txt"), "utf8")).toBe(
      "preserve fictional content",
    );
    expect((await lstat(movedRoot)).isDirectory()).toBe(true);
  });

  it.each(["", "kaul", "postgres", "../storage", "C:\\storage", "/storage"])(
    "rejects unsafe task identity %j before choosing a filesystem target",
    async (id) => {
      expect(() => getDocumentTestStorageRoot(id)).toThrow("KAUL_TEST_ID");
      await expect(createDocumentTestStorage(id)).rejects.toThrow(
        "KAUL_TEST_ID",
      );
    },
  );
});
