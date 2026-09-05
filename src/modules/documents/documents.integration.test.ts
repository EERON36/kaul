import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  AssignmentResponsibility,
  ClientStatus,
  DocumentStatus,
  UserRole,
} from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { generateAuditOperationId } from "../audit/audit";
import type { ApplicationUser } from "../authentication/guards";
import type {
  DocumentMalwareScanner,
  MalwareScanResult,
} from "./document-malware-scanner";
import { FileSystemDocumentStorage } from "./document-storage";
import {
  archiveDocumentInternal,
  authoriseDocumentDownloadInternal,
  listClientDocumentsInternal,
  uploadDocumentInternal,
} from "./documents-internal";

const FIXTURE_PREFIX = "Fiktiv Dokument-organisation ";
const organisationIds = new Set<string>();
const storageRoots: string[] = [];

function actor(
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    organisationId: string;
    professionalTitle: string | null;
  },
  organisationName: string,
): ApplicationUser {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organisationId: user.organisationId,
    organisationName,
    professionalTitle: user.professionalTitle ?? "Fiktiv titel",
    mustChangePassword: false,
    credentialState: "APPLICATION_ALLOWED",
  };
}

async function createUser(
  organisationId: string,
  role: UserRole,
  label: string,
) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      name: `Fiktiv ${label}`,
      email: `${id}@example.test`,
      role,
      organisationId,
      professionalTitle: "Fiktiv titel",
      mustChangePassword: false,
    },
  });
}

async function createFixture() {
  const organisationId = randomUUID();
  const otherOrganisationId = randomUUID();
  const organisationName = `${FIXTURE_PREFIX}${organisationId}`;
  const otherOrganisationName = `${FIXTURE_PREFIX}${otherOrganisationId}`;
  organisationIds.add(organisationId);
  organisationIds.add(otherOrganisationId);
  await prisma.organisation.createMany({
    data: [
      { id: organisationId, name: organisationName },
      { id: otherOrganisationId, name: otherOrganisationName },
    ],
  });
  const [administrator, staff, unassigned, otherAdministrator] =
    await Promise.all([
      createUser(organisationId, UserRole.ADMINISTRATOR, "administratör"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "personal"),
      createUser(organisationId, UserRole.STAFF_MEMBER, "utan uppdrag"),
      createUser(
        otherOrganisationId,
        UserRole.ADMINISTRATOR,
        "annan administratör",
      ),
    ]);
  const [client, archivedClient, otherClient] = await Promise.all([
    prisma.client.create({
      data: {
        id: randomUUID(),
        organisationId,
        firstName: "Fiktiv",
        lastName: "Dokumentklient",
        personIdentifier: `DOC-${randomUUID()}`,
        category: "ADULT",
        status: ClientStatus.ACTIVE,
      },
    }),
    prisma.client.create({
      data: {
        id: randomUUID(),
        organisationId,
        firstName: "Fiktiv",
        lastName: "Arkiverad dokumentklient",
        personIdentifier: `DOC-ARCH-${randomUUID()}`,
        category: "ADULT",
        status: ClientStatus.ARCHIVED,
        archivedAt: new Date("2026-09-01T10:00:00.000Z"),
      },
    }),
    prisma.client.create({
      data: {
        id: randomUUID(),
        organisationId: otherOrganisationId,
        firstName: "Fiktiv",
        lastName: "Annan organisation",
        personIdentifier: `DOC-OTHER-${randomUUID()}`,
        category: "ADULT",
        status: ClientStatus.ACTIVE,
      },
    }),
  ]);
  const assignment = await prisma.assignment.create({
    data: {
      id: randomUUID(),
      organisationId,
      clientId: client.id,
      staffUserId: staff.id,
      responsibility: AssignmentResponsibility.PRIMARY,
      createdByUserId: administrator.id,
    },
  });
  const root = resolve(await mkdtemp(join(tmpdir(), "kaul-documents-db-")));
  storageRoots.push(root);
  return {
    organisationId,
    administrator: actor(administrator, organisationName),
    staff: actor(staff, organisationName),
    unassigned: actor(unassigned, organisationName),
    otherAdministrator: actor(otherAdministrator, otherOrganisationName),
    client,
    archivedClient,
    otherClient,
    assignment,
    storageRoot: root,
    storage: new FileSystemDocumentStorage(root),
  };
}

const cleanScanner: DocumentMalwareScanner = {
  async scan(): Promise<MalwareScanResult> {
    return {
      status: "CLEAN",
      evidence: {
        result: "CLEAN",
        scanner: "ClamAV",
        scannerVersion: "1.4.6",
        signatureVersion: "fictional-27700",
        signatureDate: new Date("2026-09-03T18:00:00.000Z"),
        scannedAt: new Date("2026-09-03T20:00:00.000Z"),
      },
    };
  },
};

function uploadInput(clientId: string, documentId?: string) {
  const bytes = Buffer.from("Fiktivt dokument åäö\n", "utf8");
  return {
    clientId,
    documentId,
    metadata: {
      operationId: generateAuditOperationId(),
      title: "Fiktivt underlag",
      description: "Fiktiv beskrivning",
      originalFilename: "fiktivt-underlag.txt",
      declaredMediaType: "text/plain",
    },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    declaredContentLength: String(bytes.length),
  };
}

async function cleanup(ids: readonly string[]) {
  if (ids.length === 0) return;
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      'ALTER TABLE "document" DISABLE TRIGGER USER',
    );
    await transaction.$executeRawUnsafe(
      'ALTER TABLE "documentVersion" DISABLE TRIGGER USER',
    );
    try {
      await transaction.documentVersion.deleteMany({
        where: { organisationId: { in: [...ids] } },
      });
    } finally {
      await transaction.$executeRawUnsafe(
        'ALTER TABLE "documentVersion" ENABLE TRIGGER USER',
      );
    }
    await transaction.document.deleteMany({
      where: { organisationId: { in: [...ids] } },
    });
    await transaction.$executeRawUnsafe(
      'ALTER TABLE "document" ENABLE TRIGGER USER',
    );
    await transaction.assignment.deleteMany({
      where: { organisationId: { in: [...ids] } },
    });
    await transaction.client.deleteMany({
      where: { organisationId: { in: [...ids] } },
    });
    await transaction.user.deleteMany({
      where: { organisationId: { in: [...ids] } },
    });
    await transaction.organisation.deleteMany({
      where: { id: { in: [...ids] } },
    });
  });
}

beforeAll(async () => {
  const stale = await prisma.organisation.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  await cleanup(stale.map(({ id }) => id));
});

afterEach(async () => {
  const ids = [...organisationIds];
  organisationIds.clear();
  await cleanup(ids);
  await Promise.all(
    storageRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Client Documents", () => {
  it("creates immutable monotonic versions and minimal audit evidence", async () => {
    const fixture = await createFixture();
    const dependencies = { storage: fixture.storage, scanner: cleanScanner };
    const first = await uploadDocumentInternal(
      uploadInput(fixture.client.id),
      fixture.administrator,
      dependencies,
    );
    const next = await Promise.all([
      uploadDocumentInternal(
        uploadInput(fixture.client.id, first.documentId),
        fixture.staff,
        dependencies,
      ),
      uploadDocumentInternal(
        uploadInput(fixture.client.id, first.documentId),
        fixture.administrator,
        dependencies,
      ),
    ]);
    expect(next.map(({ versionNumber }) => versionNumber).sort()).toEqual([
      2, 3,
    ]);
    const versions = await prisma.documentVersion.findMany({
      where: { documentId: first.documentId },
      orderBy: { versionNumber: "asc" },
    });
    expect(versions).toHaveLength(3);
    expect(new Set(versions.map((version) => version.storageKey)).size).toBe(3);
    await expect(
      prisma.documentVersion.update({
        where: { id: first.versionId },
        data: { displayFilename: "changed.txt" },
      }),
    ).rejects.toThrow();
    const actions = await prisma.auditOperation.findMany({
      where: { targetId: first.documentId },
      select: { action: true, targetType: true },
      orderBy: { createdAt: "asc" },
    });
    expect(actions).toEqual([
      { action: "DOCUMENT_UPLOADED", targetType: "DOCUMENT" },
      { action: "DOCUMENT_VERSION_CREATED", targetType: "DOCUMENT" },
      { action: "DOCUMENT_VERSION_CREATED", targetType: "DOCUMENT" },
    ]);
  });

  it("compensates a promoted object after a definitive database failure", async () => {
    const fixture = await createFixture();
    await expect(
      uploadDocumentInternal(
        uploadInput(fixture.client.id),
        fixture.administrator,
        {
          storage: fixture.storage,
          scanner: cleanScanner,
          afterBusinessMutation: async () => {
            throw new Error("fictional database-stage failure");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    expect(
      await prisma.document.count({ where: { clientId: fixture.client.id } }),
    ).toBe(0);
    expect(await readdir(join(fixture.storageRoot, "objects"))).toEqual([]);
  });

  it("classifies callback-returned commit acknowledgement states", async () => {
    const committed = await createFixture();
    await expect(
      uploadDocumentInternal(
        uploadInput(committed.client.id),
        committed.administrator,
        {
          storage: committed.storage,
          scanner: cleanScanner,
          runBusinessTransactionForTest: async (callback) => {
            await prisma.$transaction(callback);
            throw new Error("fictional acknowledgement loss after commit");
          },
        },
      ),
    ).resolves.toMatchObject({ versionNumber: 1 });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: {
          operation: { organisationId: committed.organisationId },
          type: "OUTCOME",
        },
        select: { result: true },
      }),
    ).resolves.toEqual({ result: "SUCCEEDED" });

    const rolledBack = await createFixture();
    await expect(
      uploadDocumentInternal(
        uploadInput(rolledBack.client.id),
        rolledBack.administrator,
        {
          storage: rolledBack.storage,
          scanner: cleanScanner,
          runBusinessTransactionForTest: (callback) =>
            prisma.$transaction(async (transaction) => {
              await callback(transaction);
              throw new Error("fictional rollback before acknowledgement");
            }),
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    expect(await readdir(join(rolledBack.storageRoot, "objects"))).toEqual([]);

    const unknown = await createFixture();
    await expect(
      uploadDocumentInternal(
        uploadInput(unknown.client.id),
        unknown.administrator,
        {
          storage: unknown.storage,
          scanner: cleanScanner,
          runBusinessTransactionForTest: (callback) =>
            prisma.$transaction(async (transaction) => {
              await callback(transaction);
              throw new Error("fictional unknown transaction result");
            }),
          beforeCommitVerificationForTest: async () => {
            throw new Error("fictional verification transport failure");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "OPERATION_AMBIGUOUS" });
    expect(await readdir(join(unknown.storageRoot, "objects"))).toHaveLength(1);
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: {
          operation: { organisationId: unknown.organisationId },
          type: "OUTCOME",
        },
        select: { result: true },
      }),
    ).resolves.toEqual({ result: "AMBIGUOUS" });
  });

  it("reuses Client access and denies unassigned, cross-organisation, and lost access", async () => {
    const fixture = await createFixture();
    const dependencies = { storage: fixture.storage, scanner: cleanScanner };
    await expect(
      uploadDocumentInternal(
        uploadInput(fixture.client.id),
        fixture.unassigned,
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      uploadDocumentInternal(
        uploadInput(fixture.client.id),
        fixture.otherAdministrator,
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    await expect(
      uploadDocumentInternal(uploadInput(fixture.client.id), fixture.staff, {
        ...dependencies,
        beforeBusinessTransaction: async () => {
          await prisma.assignment.update({
            where: { id: fixture.assignment.id },
            data: { endedAt: new Date() },
          });
        },
      }),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    expect(
      await prisma.document.count({ where: { clientId: fixture.client.id } }),
    ).toBe(0);
  });

  it("fails scanner rejection closed and creates no available version", async () => {
    const fixture = await createFixture();
    await expect(
      uploadDocumentInternal(
        uploadInput(fixture.client.id),
        fixture.administrator,
        {
          storage: fixture.storage,
          scanner: {
            async scan() {
              return { status: "REJECTED", detected: true };
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "SCAN_REJECTED" });
    expect(
      await prisma.documentVersion.count({
        where: { organisationId: fixture.organisationId },
      }),
    ).toBe(0);
    const actions = await prisma.auditOperation.findMany({
      where: { organisationId: fixture.organisationId },
      select: { action: true },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map(({ action }) => action)).toEqual([
      "DOCUMENT_UPLOADED",
      "DOCUMENT_SCAN_REJECTED",
    ]);
  });

  it("keeps archived Clients read-only and verifies authorised downloads", async () => {
    const fixture = await createFixture();
    const dependencies = { storage: fixture.storage, scanner: cleanScanner };
    const uploaded = await uploadDocumentInternal(
      uploadInput(fixture.client.id),
      fixture.administrator,
      dependencies,
    );
    const download = await authoriseDocumentDownloadInternal(
      {
        clientId: fixture.client.id,
        documentId: uploaded.documentId,
        versionId: uploaded.versionId,
      },
      fixture.staff,
      fixture.storage,
    );
    const chunks: Buffer[] = [];
    for await (const chunk of download.handle.createReadStream()) {
      chunks.push(Buffer.from(chunk));
    }
    await download.handle.close();
    expect(Buffer.concat(chunks).toString("utf8")).toContain("Fiktivt");
    await archiveDocumentInternal(
      {
        operationId: generateAuditOperationId(),
        clientId: fixture.client.id,
        documentId: uploaded.documentId,
      },
      fixture.administrator,
    );
    await expect(
      prisma.document.update({
        where: { id: uploaded.documentId },
        data: {
          status: DocumentStatus.ACTIVE,
          archivedAt: null,
          archivedByUserId: null,
        },
      }),
    ).rejects.toThrow();
    const accepted = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: uploaded.versionId },
    });
    await expect(
      prisma.documentVersion.create({
        data: {
          ...accepted,
          id: randomUUID(),
          versionNumber: 2,
          storageKey: "f".repeat(64),
        },
      }),
    ).rejects.toThrow();
    await expect(
      archiveDocumentInternal(
        {
          operationId: generateAuditOperationId(),
          clientId: fixture.client.id,
          documentId: uploaded.documentId,
        },
        fixture.staff,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    expect(
      (
        await listClientDocumentsInternal(
          fixture.client.id,
          fixture.administrator,
        )
      )[0]?.status,
    ).toBe(DocumentStatus.ARCHIVED);
    await expect(
      uploadDocumentInternal(
        uploadInput(fixture.archivedClient.id),
        fixture.administrator,
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
  });

  it("fails closed for guessed download identities and corrupt or missing objects", async () => {
    const fixture = await createFixture();
    const uploaded = await uploadDocumentInternal(
      uploadInput(fixture.client.id),
      fixture.administrator,
      { storage: fixture.storage, scanner: cleanScanner },
    );
    for (const attempt of [
      { actor: fixture.unassigned, clientId: fixture.client.id },
      { actor: fixture.otherAdministrator, clientId: fixture.client.id },
      { actor: fixture.staff, clientId: randomUUID() },
    ]) {
      await expect(
        authoriseDocumentDownloadInternal(
          {
            clientId: attempt.clientId,
            documentId: uploaded.documentId,
            versionId: uploaded.versionId,
          },
          attempt.actor,
          fixture.storage,
        ),
      ).rejects.toMatchObject({
        code: "TARGET_UNAVAILABLE",
        message: "Document requirement not satisfied.",
      });
    }
    await expect(
      authoriseDocumentDownloadInternal(
        {
          clientId: fixture.client.id,
          documentId: randomUUID(),
          versionId: uploaded.versionId,
        },
        fixture.staff,
        fixture.storage,
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });

    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: uploaded.versionId },
      select: { storageKey: true, sizeBytes: true },
    });
    const objectPath = join(fixture.storageRoot, "objects", version.storageKey);
    await chmod(objectPath, 0o600);
    await writeFile(objectPath, Buffer.alloc(Number(version.sizeBytes), 0x78));
    await expect(
      authoriseDocumentDownloadInternal(
        {
          clientId: fixture.client.id,
          documentId: uploaded.documentId,
          versionId: uploaded.versionId,
        },
        fixture.staff,
        fixture.storage,
      ),
    ).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });
    await rm(objectPath);
    await expect(
      authoriseDocumentDownloadInternal(
        {
          clientId: fixture.client.id,
          documentId: uploaded.documentId,
          versionId: uploaded.versionId,
        },
        fixture.staff,
        fixture.storage,
      ),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });

  it("enforces database scope, uniqueness, retention, and immutability constraints", async () => {
    const fixture = await createFixture();
    const uploaded = await uploadDocumentInternal(
      uploadInput(fixture.client.id),
      fixture.administrator,
      { storage: fixture.storage, scanner: cleanScanner },
    );
    const accepted = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: uploaded.versionId },
    });

    await expect(
      prisma.document.create({
        data: {
          id: randomUUID(),
          organisationId: fixture.otherAdministrator.organisationId,
          clientId: fixture.client.id,
          title: "Felaktigt organisationsomfång",
          createdByUserId: fixture.otherAdministrator.userId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.documentVersion.create({
        data: {
          ...accepted,
          id: randomUUID(),
          storageKey: "d".repeat(64),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.documentVersion.create({
        data: {
          ...accepted,
          id: randomUUID(),
          versionNumber: 2,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.documentVersion.delete({ where: { id: uploaded.versionId } }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe('TRUNCATE TABLE "documentVersion"'),
    ).rejects.toThrow();
    await expect(
      prisma.document.delete({ where: { id: uploaded.documentId } }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe('TRUNCATE TABLE "document"'),
    ).rejects.toThrow();

    await prisma.assignment.delete({ where: { id: fixture.assignment.id } });
    await expect(
      prisma.client.delete({ where: { id: fixture.client.id } }),
    ).rejects.toThrow();
  });

  it("serialises direct version inserts with the terminal archive transition", async () => {
    const fixture = await createFixture();
    const uploaded = await uploadDocumentInternal(
      uploadInput(fixture.client.id),
      fixture.administrator,
      { storage: fixture.storage, scanner: cleanScanner },
    );
    const accepted = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: uploaded.versionId },
    });

    let releaseInsert!: () => void;
    const holdInsert = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    let markInsertReady!: () => void;
    const insertReady = new Promise<void>((resolve) => {
      markInsertReady = resolve;
    });
    let archiveSettled = false;

    const insertVersion = prisma.$transaction(async (transaction) => {
      await transaction.documentVersion.create({
        data: {
          ...accepted,
          id: randomUUID(),
          versionNumber: 2,
          storageKey: "e".repeat(64),
        },
      });
      markInsertReady();
      await holdInsert;
    });

    await insertReady;
    const archive = prisma.document
      .update({
        where: { id: uploaded.documentId },
        data: {
          status: DocumentStatus.ARCHIVED,
          archivedAt: new Date("2026-09-03T21:00:00.000Z"),
          archivedByUserId: fixture.administrator.userId,
        },
      })
      .finally(() => {
        archiveSettled = true;
      });

    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(archiveSettled).toBe(false);
    } finally {
      releaseInsert();
    }

    await Promise.all([insertVersion, archive]);
    const result = await prisma.document.findUniqueOrThrow({
      where: { id: uploaded.documentId },
      select: {
        status: true,
        versions: { select: { id: true } },
      },
    });
    expect(result.status).toBe(DocumentStatus.ARCHIVED);
    expect(result.versions).toHaveLength(2);
    expect(result.versions).toEqual(
      expect.arrayContaining([
        { id: uploaded.versionId },
        expect.objectContaining({ id: expect.any(String) }),
      ]),
    );
  });
});
