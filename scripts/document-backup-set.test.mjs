import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  DocumentBackupSetError,
  parseDocumentBackupManifest,
  verifyDocumentBackupSet,
} from "./document-backup-set-core.mjs";

const roots = [];
const key = "a".repeat(64);
const content = Buffer.from("fictional document");
const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(
  new URL("./document-backup-set.mjs", import.meta.url),
);

function manifest(objects = []) {
  return {
    format: "kaul-document-backup-set-v1",
    createdAt: "2026-09-03T20:00:00.000Z",
    applicationGitSha: "b".repeat(40),
    migrationNames: [
      "20260903120000_add_client_documents",
      "20260903121000_protect_client_document_lifecycle",
    ],
    postgresqlSnapshotId: "c".repeat(64),
    objectsSnapshotId: "d".repeat(64),
    objects,
  };
}

async function fixture() {
  const root = resolve(await mkdtemp(join(tmpdir(), "kaul-backup-set-")));
  roots.push(root);
  await mkdir(join(root, "objects"));
  await mkdir(join(root, "quarantine"));
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Document backup-set verifier", () => {
  it("runs the CLI wrapper through the shared verifier implementation", async () => {
    const root = await fixture();
    await writeFile(join(root, "objects", key), content);
    const manifestPath = join(root, "manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        manifest([
          {
            storageKey: key,
            sizeBytes: content.length,
            sha256: createHash("sha256").update(content).digest("hex"),
          },
        ]),
      ),
    );

    const result = await execFileAsync(
      process.execPath,
      [cliPath, "verify", manifestPath, root],
      { windowsHide: true },
    );

    expect(result.stdout).toBe(
      "Document backup set verified: 1 immutable object(s).\n",
    );
    expect(result.stderr).toBe("");
  });

  it("keeps CLI manifest failures generic", async () => {
    const root = await fixture();
    const manifestPath = join(root, "invalid-manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest(),
        fictionalSensitiveDetail: "do-not-leak",
      }),
    );

    await expect(
      execFileAsync(process.execPath, [cliPath, "verify", manifestPath, root], {
        windowsHide: true,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: "Document backup-set verification failed.\n",
    });
  });

  it("binds exact snapshot IDs, migration lineage, and immutable objects", async () => {
    const root = await fixture();
    await writeFile(join(root, "objects", key), content);
    await expect(
      verifyDocumentBackupSet(
        manifest([
          {
            storageKey: key,
            sizeBytes: content.length,
            sha256: createHash("sha256").update(content).digest("hex"),
          },
        ]),
        root,
      ),
    ).resolves.toEqual({
      objectCount: 1,
      postgresqlSnapshotId: "c".repeat(64),
      objectsSnapshotId: "d".repeat(64),
    });
  });

  it.each(["missing", "orphan", "corrupt", "wrong-size"])(
    "rejects a %s restored object set",
    async (failure) => {
      const root = await fixture();
      const expected = {
        storageKey: key,
        sizeBytes: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      };
      if (failure !== "missing") {
        await writeFile(
          join(root, "objects", key),
          failure === "corrupt" ? Buffer.from("corrupt document") : content,
        );
      }
      if (failure === "orphan") {
        await writeFile(join(root, "objects", "e".repeat(64)), content);
      }
      if (failure === "wrong-size") expected.sizeBytes += 1;
      await expect(
        verifyDocumentBackupSet(manifest([expected]), root),
      ).rejects.toBeInstanceOf(DocumentBackupSetError);
    },
  );

  it("rejects incomplete or non-canonical manifests", () => {
    expect(() => parseDocumentBackupManifest({})).toThrow(
      DocumentBackupSetError,
    );
    expect(() =>
      parseDocumentBackupManifest({ ...manifest(), unexpected: true }),
    ).toThrow(DocumentBackupSetError);
  });

  it("rejects non-regular and symlinked restored objects", async () => {
    const root = await fixture();
    const expected = {
      storageKey: key,
      sizeBytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
    const objectPath = join(root, "objects", key);
    await mkdir(objectPath);
    await expect(
      verifyDocumentBackupSet(manifest([expected]), root),
    ).rejects.toBeInstanceOf(DocumentBackupSetError);
    await rm(objectPath, { recursive: true });
    const target = join(root, "target.txt");
    await writeFile(target, content);
    try {
      await symlink(target, objectPath);
    } catch {
      return;
    }
    await expect(
      verifyDocumentBackupSet(manifest([expected]), root),
    ).rejects.toBeInstanceOf(DocumentBackupSetError);
  });
});
