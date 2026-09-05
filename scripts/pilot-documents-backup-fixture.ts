// Fictional CI fixture. Real domain upload/download, PostgreSQL and filesystem;
// upload scan evidence is a fixture, not evidence of live ClamAV scanning.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lstat, open, readdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApplicationUser } from "../src/modules/authentication/guards";
import { getTestEnvironment } from "../src/test/test-environment";

async function main() {
  const [mode] = process.argv.slice(2);
  assert.ok(mode === "seed" || mode === "verify");
  assert.equal(process.argv.length, 3);
  assert.equal(process.env.CI, "true");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const environment = getTestEnvironment(process.env);
  assert.equal(environment.testId, "ci_backup_documents");
  assert.equal(environment.port, 3104);
  const workspace = process.env.KAUL_CI_DOCUMENTS_WORKSPACE!;
  assert.match(workspace, /^\/tmp\/kaul-documents-backup-ci\.[a-zA-Z0-9]+$/);
  assert.equal(await realpath(workspace), workspace);
  assert.equal((await lstat(workspace)).mode & 0o777, 0o700);
  const root = join(workspace, mode === "seed" ? "documents" : "restored");
  assert.equal(await realpath(root), root);
  if (mode === "verify") {
    const restoredUrl = new URL(environment.databaseUrl);
    restoredUrl.pathname = "/kaul_restore_ci_backup_documents";
    process.env.DATABASE_URL = restoredUrl.href;
    process.env.INTEGRATION_DATABASE_URL = restoredUrl.href;
  }
  // No client or domain module is loaded before the task/database/root guards.
  const { prisma } = await import("../src/lib/prisma");
  const { FileSystemDocumentStorage } =
    await import("../src/modules/documents/document-storage");
  const {
    uploadDocumentInternal,
    authoriseDocumentDownloadInternal,
    DocumentError,
  } = await import("../src/modules/documents/documents-internal");
  class ObservedStorage extends FileSystemDocumentStorage {
    opens = 0;
    override async open(storageKey: string) {
      this.opens += 1;
      return super.open(storageKey);
    }
  }
  const storage = new ObservedStorage(root);
  const payload = (version: number) =>
    Buffer.from(`Fiktivt återställt dokument version ${version}.\n`, "utf8");
  const toActor = (user: {
    id: string;
    name: string;
    email: string;
    role: ApplicationUser["role"];
    organisationId: string | null;
    professionalTitle: string | null;
  }): ApplicationUser => ({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organisationId: user.organisationId!,
    organisationName: "Fiktiv återställningsorganisation",
    professionalTitle: user.professionalTitle!,
    mustChangePassword: false,
    credentialState: "APPLICATION_ALLOWED",
  });
  try {
    if (mode === "seed") {
      assert.equal(
        await prisma.organisation.count(),
        0,
        "Fixture requires a fresh database.",
      );
      const organisation = await prisma.organisation.create({
        data: { id: randomUUID(), name: "Fiktiv återställningsorganisation" },
      });
      const other = await prisma.organisation.create({
        data: { id: randomUUID(), name: "Fiktiv annan organisation" },
      });
      const users = [];
      for (const [label, role, organisationId] of [
        ["admin", "ADMINISTRATOR", organisation.id],
        ["assigned", "STAFF_MEMBER", organisation.id],
        ["unassigned", "STAFF_MEMBER", organisation.id],
        ["other", "ADMINISTRATOR", other.id],
      ] as const) {
        users.push(
          await prisma.user.create({
            data: {
              id: randomUUID(),
              name: `Fiktiv ${label}`,
              email: `${label}@backup.example.test`,
              role,
              organisationId,
              professionalTitle: "Fiktiv titel",
              mustChangePassword: false,
            },
          }),
        );
      }
      const [admin, assigned] = users;
      const client = await prisma.client.create({
        data: {
          id: randomUUID(),
          organisationId: organisation.id,
          firstName: "Fiktiv",
          lastName: "Återställningsklient",
          personIdentifier: "FICTIONAL-BACKUP-222",
          category: "ADULT",
          status: "ACTIVE",
        },
      });
      await prisma.assignment.create({
        data: {
          id: randomUUID(),
          organisationId: organisation.id,
          clientId: client.id,
          staffUserId: assigned.id,
          createdByUserId: admin.id,
          responsibility: "PRIMARY",
        },
      });
      let documentId: string | undefined;
      for (const version of [1, 2]) {
        const bytes = payload(version);
        const result = await uploadDocumentInternal(
          {
            clientId: client.id,
            documentId,
            metadata: {
              operationId: randomUUID(),
              title: "Fiktivt underlag",
              description: null,
              originalFilename: `fiktiv-${version}.txt`,
              declaredMediaType: "text/plain",
            },
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(bytes);
                controller.close();
              },
            }),
            declaredContentLength: String(bytes.length),
          },
          toActor(assigned),
          {
            storage,
            scanner: {
              async scan() {
                return {
                  status: "CLEAN",
                  evidence: {
                    result: "CLEAN",
                    scanner: "ClamAV",
                    scannerVersion: "fictional-ci",
                    signatureVersion: "fictional-ci",
                    signatureDate: new Date(),
                    scannedAt: new Date(),
                  },
                };
              },
            },
          },
        );
        documentId = result.documentId;
        assert.equal(result.versionNumber, version);
      }
      await writeFile(
        join(root, "quarantine", "fictional-uncommitted"),
        "Fictional residue excluded from immutable backup.",
      );
      process.stdout.write(
        "Documents backup fixture seeded: two immutable versions.\n",
      );
    } else {
      const versions = await prisma.documentVersion.findMany({
        orderBy: { versionNumber: "asc" },
      });
      assert.equal(versions.length, 2);
      assert.equal(process.getuid?.(), 1000);
      const isPermissionDenial = (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "EACCES";
      // Prove the actual process cannot write; permission bits alone are not evidence.
      for (const directory of [
        root,
        join(root, "objects"),
        join(root, "quarantine"),
      ]) {
        assert.equal((await lstat(directory)).mode & 0o777, 0o500);
        await assert.rejects(
          writeFile(join(directory, "fictional-write-probe"), "fictional", {
            flag: "wx",
          }),
          isPermissionDenial,
        );
      }
      for (const version of versions) {
        const path = join(root, "objects", version.storageKey);
        assert.equal((await lstat(path)).mode & 0o777, 0o400);
        await assert.rejects(async () => {
          const handle = await open(path, "r+");
          await handle.close();
        }, isPermissionDenial);
      }
      assert.equal(versions[0].documentId, versions[1].documentId);
      assert.deepEqual(await readdir(join(root, "quarantine")), []);
      const assigned = toActor(
        await prisma.user.findUniqueOrThrow({
          where: { email: "assigned@backup.example.test" },
        }),
      );
      for (const version of versions) {
        const input = {
          clientId: version.clientId,
          documentId: version.documentId,
          versionId: version.id,
        };
        const download = await authoriseDocumentDownloadInternal(
          input,
          assigned,
          storage,
        );
        try {
          // Authorisation audit is durable before any response bytes are read.
          assert.equal(
            await prisma.auditEvent.count({
              where: {
                result: "SUCCEEDED",
                operation: {
                  action: "DOCUMENT_DOWNLOAD_AUTHORISED",
                  targetId: version.id,
                },
              },
            }),
            1,
          );
          const chunks: Buffer[] = [];
          for await (const chunk of download.handle.createReadStream())
            chunks.push(Buffer.from(chunk));
          assert.deepEqual(
            Buffer.concat(chunks),
            payload(version.versionNumber),
          );
        } finally {
          await download.handle.close();
        }
        const opensBeforeDenial = storage.opens;
        for (const email of [
          "unassigned@backup.example.test",
          "other@backup.example.test",
        ]) {
          const denied = toActor(
            await prisma.user.findUniqueOrThrow({ where: { email } }),
          );
          await assert.rejects(
            authoriseDocumentDownloadInternal(input, denied, storage),
            (error: unknown) =>
              error instanceof DocumentError &&
              error.code === "TARGET_UNAVAILABLE",
          );
        }
        assert.equal(storage.opens, opensBeforeDenial);
      }
      const migrationRows = await prisma.$queryRaw<
        Array<{ migration_name: string }>
      >`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
      const migrationNames = migrationRows.map((row) => row.migration_name);
      const reviewedMigrations = (
        await readdir(join(process.cwd(), "prisma", "migrations"), {
          withFileTypes: true,
        })
      )
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      assert.equal(reviewedMigrations.length, 10);
      assert.deepEqual(migrationNames, reviewedMigrations);
      await writeFile(
        join(workspace, "restored-metadata.json"),
        JSON.stringify({
          migrationNames,
          objects: versions
            .map(({ storageKey, sizeBytes, sha256 }) => ({
              storageKey,
              sizeBytes: Number(sizeBytes),
              sha256,
            }))
            .sort((a, b) => a.storageKey.localeCompare(b.storageKey)),
        }),
      );
      process.stdout.write(
        "Restored Documents: two real authorised byte downloads from permission-read-only storage, four denied domain downloads, ten reviewed migrations.\n",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write("Documents backup fixture failed.\n");
  process.exitCode = 1;
});
