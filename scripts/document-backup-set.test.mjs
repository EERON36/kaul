import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDocumentBackupManifest,
  DocumentBackupSetError,
  parseDocumentBackupManifest,
  parseDocumentBackupMetadata,
  serializeDocumentBackupManifest,
  verifyDocumentBackupMetadata,
  verifyDocumentBackupSet,
  verifyResticManifestCatalog,
  verifyResticObjectsCatalog,
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

  it.each([
    ["applicationGitSha", "b".repeat(40)],
    ["postgresqlSnapshotId", "c".repeat(64)],
    ["objectsSnapshotId", "d".repeat(64)],
  ])(
    "rejects a non-string %s even when it coerces to valid hex",
    (field, value) => {
      expect(() =>
        parseDocumentBackupManifest({ ...manifest(), [field]: [value] }),
      ).toThrow(DocumentBackupSetError);
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

describe("Document backup-set construction and Restic catalog", () => {
  const expectedObject = {
    storageKey: key,
    sizeBytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
  const metadata = {
    migrationNames: [
      "20260903120000_add_client_documents",
      "20260903121000_protect_client_document_lifecycle",
    ],
    objects: [expectedObject],
  };

  it("constructs one canonical manifest from trusted metadata and exact IDs", () => {
    const value = createDocumentBackupManifest({
      applicationGitSha: "b".repeat(40),
      createdAt: "2026-09-05T10:00:00.000Z",
      metadata,
      postgresqlSnapshotId: "c".repeat(64),
      objectsSnapshotId: "d".repeat(64),
    });

    expect(JSON.parse(serializeDocumentBackupManifest(value))).toEqual(value);
    expect(verifyDocumentBackupMetadata(value, metadata)).toEqual({
      objectCount: 1,
    });
  });

  it("rejects unsorted metadata and restored database metadata drift", () => {
    expect(() =>
      parseDocumentBackupMetadata({
        ...metadata,
        migrationNames: [...metadata.migrationNames].reverse(),
      }),
    ).toThrow(DocumentBackupSetError);
    expect(() =>
      verifyDocumentBackupMetadata(manifest([expectedObject]), {
        ...metadata,
        objects: [
          { ...expectedObject, sizeBytes: expectedObject.sizeBytes + 1 },
        ],
      }),
    ).toThrow(DocumentBackupSetError);
  });

  it("accepts only the exact Restic /objects subtree and snapshot ID", () => {
    const snapshotId = "d".repeat(64);
    const catalog = [
      JSON.stringify({ message_type: "snapshot", id: snapshotId }),
      JSON.stringify({
        struct_type: "node",
        path: "/objects",
        type: "dir",
      }),
      JSON.stringify({
        struct_type: "node",
        path: `/objects/${key}`,
        type: "file",
        size: content.length,
      }),
    ].join("\n");

    expect(verifyResticObjectsCatalog(metadata, snapshotId, catalog)).toEqual({
      objectCount: 1,
      snapshotId,
    });
    for (const invalidCatalog of [
      catalog.replace(snapshotId, "e".repeat(64)),
      `${catalog}\n${JSON.stringify({
        struct_type: "node",
        path: "/quarantine",
        type: "dir",
      })}`,
      catalog.replace('"type":"file"', '"type":"symlink"'),
      catalog.replace(`/objects/${key}`, `/objects/${"f".repeat(64)}`),
    ]) {
      expect(() =>
        verifyResticObjectsCatalog(metadata, snapshotId, invalidCatalog),
      ).toThrow(DocumentBackupSetError);
    }
  });

  it("runs create, get, metadata, and catalog checks through the CLI", async () => {
    const root = await fixture();
    const metadataPath = join(root, "metadata.json");
    const manifestPath = join(root, "manifest.json");
    await writeFile(metadataPath, JSON.stringify(metadata));
    const created = await execFileAsync(
      process.execPath,
      [
        cliPath,
        "create",
        metadataPath,
        "b".repeat(40),
        "c".repeat(64),
        "d".repeat(64),
        "2026-09-05T10:00:00.000Z",
      ],
      { windowsHide: true },
    );
    await writeFile(manifestPath, created.stdout);

    const selected = await execFileAsync(
      process.execPath,
      [cliPath, "get", manifestPath, "objectsSnapshotId"],
      { windowsHide: true },
    );
    expect(selected.stdout).toBe(`${"d".repeat(64)}\n`);

    await expect(
      execFileAsync(
        process.execPath,
        [cliPath, "verify-metadata", manifestPath, metadataPath],
        { windowsHide: true },
      ),
    ).resolves.toMatchObject({ stdout: "", stderr: "" });

    const catalog = [
      JSON.stringify({ message_type: "snapshot", id: "d".repeat(64) }),
      JSON.stringify({
        struct_type: "node",
        path: "/objects",
        type: "dir",
      }),
      JSON.stringify({
        struct_type: "node",
        path: `/objects/${key}`,
        type: "file",
        size: content.length,
      }),
      "",
    ].join("\n");
    const catalogPath = join(root, "catalog.jsonl");
    await writeFile(catalogPath, catalog);
    const catalogResult = await execFileAsync(
      process.execPath,
      [cliPath, "verify-catalog", metadataPath, "d".repeat(64), catalogPath],
      { windowsHide: true },
    );
    expect(catalogResult).toMatchObject({ stdout: "", stderr: "" });
  });
});
describe("Document backup-set manifest snapshot catalog", () => {
  it("requires exactly one nonempty manifest file at the canonical path", () => {
    const snapshotId = "e".repeat(64);
    const catalog = [
      JSON.stringify({ message_type: "snapshot", id: snapshotId }),
      JSON.stringify({
        struct_type: "node",
        path: "/kaul-document-backup-set.json",
        type: "file",
        size: 100,
      }),
    ].join("\n");

    expect(verifyResticManifestCatalog(snapshotId, catalog)).toEqual({
      snapshotId,
    });
    expect(() =>
      verifyResticManifestCatalog(
        snapshotId,
        catalog +
          "\n" +
          JSON.stringify({
            struct_type: "node",
            path: "/unexpected",
            type: "file",
            size: 1,
          }),
      ),
    ).toThrow(DocumentBackupSetError);
    expect(() => verifyResticManifestCatalog([snapshotId], catalog)).toThrow(
      DocumentBackupSetError,
    );
  });
});
