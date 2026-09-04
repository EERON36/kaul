import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { Prisma } from "../../generated/prisma/client";
import { DocumentStatus } from "../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { ApplicationUser } from "../authentication/guards";
import {
  appendAuditOutcomeInTransaction,
  createUserAuditIntent,
  generateAuditOperationId,
  recordAmbiguousAuditOutcome,
  recordFailedAuditOutcome,
  recordSucceededAuditOutcome,
  type AuditIntentHandle,
} from "../audit/audit";
import {
  getClientDetailAccessWhere,
  getOrdinaryClientAccessWhere,
} from "../clients/client-access";
import { lockClientForMutation } from "../clients/client-mutation-lock";
import {
  normalizeDisplayFilename,
  requireApprovedDeclaredType,
  uploadMetadataSchema,
  type UploadMetadata,
} from "./document-input";
import {
  DocumentMalwareScannerError,
  type DocumentMalwareScanner,
} from "./document-malware-scanner";
import {
  DocumentStorageError,
  generateDocumentStorageKey,
  type DocumentObjectHandle,
  type DocumentStorage,
} from "./document-storage";
import {
  DocumentValidationError,
  storeBoundedUpload,
  validateStoredUpload,
} from "./document-validation";

const DOCUMENT_ERROR_MESSAGE = "Document requirement not satisfied.";

export type DocumentErrorCode =
  | "TARGET_UNAVAILABLE"
  | "INVALID_STATE"
  | "SCAN_REJECTED"
  | "SCANNER_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "INTEGRITY_FAILED"
  | "OPERATION_AMBIGUOUS"
  | "INCONSISTENT_RESULT";

export class DocumentError extends Error {
  readonly code: DocumentErrorCode;

  constructor(code: DocumentErrorCode) {
    super(DOCUMENT_ERROR_MESSAGE);
    Object.defineProperty(this, "name", {
      value: "DocumentError",
      configurable: true,
    });
    this.code = code;
  }
}

class DefinitiveDocumentError extends Error {
  readonly code: DocumentErrorCode;
  constructor(code: DocumentErrorCode) {
    super(DOCUMENT_ERROR_MESSAGE);
    this.code = code;
  }
}

type DocumentDatabase = Pick<
  Prisma.TransactionClient,
  "user" | "client" | "document" | "documentVersion" | "$queryRaw"
>;

export type DocumentDependencies = Readonly<{
  storage: DocumentStorage;
  scanner: DocumentMalwareScanner;
  beforeBusinessTransaction?: () => Promise<void>;
  afterBusinessMutation?: (
    transaction: Prisma.TransactionClient,
  ) => Promise<void>;
  runBusinessTransactionForTest?: <T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
  beforeCommitVerificationForTest?: () => Promise<void>;
}>;

export type DocumentVersionItem = Readonly<{
  id: string;
  versionNumber: number;
  displayFilename: string;
  mediaType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploaderName: string;
}>;

export type DocumentListItem = Readonly<{
  id: string;
  title: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  archivedAt: Date | null;
  latestVersion: DocumentVersionItem;
}>;

export type DocumentDetail = DocumentListItem &
  Readonly<{ versions: readonly DocumentVersionItem[] }>;

export type DocumentDownload = Readonly<{
  handle: DocumentObjectHandle;
  displayFilename: string;
  mediaType: string;
  sizeBytes: number;
}>;

async function requireCurrentActor(
  database: DocumentDatabase,
  actor: ApplicationUser,
): Promise<ApplicationUser> {
  const current = await database.user.findFirst({
    where: {
      id: actor.userId,
      organisationId: actor.organisationId,
      banned: { not: true },
      mustChangePassword: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organisationId: true,
      professionalTitle: true,
      organisation: { select: { id: true, name: true } },
    },
  });
  if (
    !current ||
    current.organisation.id !== current.organisationId ||
    current.organisationId !== actor.organisationId
  ) {
    throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
  }
  return {
    userId: current.id,
    name: current.name,
    email: current.email,
    role: current.role,
    organisationId: current.organisationId,
    organisationName: current.organisation.name,
    professionalTitle: current.professionalTitle,
    mustChangePassword: false,
    credentialState: "APPLICATION_ALLOWED",
  };
}

async function requireClient(
  database: DocumentDatabase,
  actor: ApplicationUser,
  clientId: string,
  mode: "READ" | "WORK",
): Promise<ApplicationUser> {
  const currentActor = await requireCurrentActor(database, actor);
  const client = await database.client.findFirst({
    where: {
      id: clientId,
      ...(mode === "READ"
        ? getClientDetailAccessWhere(currentActor)
        : getOrdinaryClientAccessWhere(currentActor)),
    },
    select: { id: true },
  });
  if (!client) throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
  return currentActor;
}

function publicError(error: unknown): never {
  if (error instanceof DocumentError) throw error;
  if (error instanceof DefinitiveDocumentError) {
    throw new DocumentError(error.code);
  }
  if (error instanceof DocumentValidationError) throw error;
  if (error instanceof DocumentMalwareScannerError) {
    throw new DocumentError("SCANNER_UNAVAILABLE");
  }
  if (error instanceof DocumentStorageError) {
    throw new DocumentError("STORAGE_UNAVAILABLE");
  }
  throw new DocumentError("INCONSISTENT_RESULT");
}

function mapVersion(version: {
  id: string;
  versionNumber: number;
  displayFilename: string;
  mediaType: string;
  sizeBytes: bigint;
  uploadedAt: Date;
  uploadedByUser: { name: string };
}): DocumentVersionItem {
  const sizeBytes = Number(version.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes)) {
    throw new DocumentError("INCONSISTENT_RESULT");
  }
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    displayFilename: version.displayFilename,
    mediaType: version.mediaType,
    sizeBytes,
    uploadedAt: version.uploadedAt,
    uploaderName: version.uploadedByUser.name,
  };
}

const versionSelection = {
  id: true,
  versionNumber: true,
  displayFilename: true,
  mediaType: true,
  sizeBytes: true,
  uploadedAt: true,
  uploadedByUser: { select: { name: true } },
} satisfies Prisma.DocumentVersionSelect;

export async function listClientDocumentsInternal(
  clientId: string,
  actor: ApplicationUser,
): Promise<readonly DocumentListItem[]> {
  try {
    const currentActor = await requireClient(prisma, actor, clientId, "READ");
    const rows = await prisma.document.findMany({
      where: {
        organisationId: currentActor.organisationId,
        clientId,
        client: { is: getClientDetailAccessWhere(currentActor) },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        archivedAt: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: versionSelection,
        },
      },
    });
    return rows.flatMap((row) => {
      const latest = row.versions[0];
      return latest
        ? [
            {
              id: row.id,
              title: row.title,
              description: row.description,
              status: row.status,
              createdAt: row.createdAt,
              archivedAt: row.archivedAt,
              latestVersion: mapVersion(latest),
            },
          ]
        : [];
    });
  } catch (error) {
    return publicError(error);
  }
}

export async function getDocumentDetailInternal(
  clientId: string,
  documentId: string,
  actor: ApplicationUser,
): Promise<DocumentDetail> {
  try {
    const currentActor = await requireClient(prisma, actor, clientId, "READ");
    const row = await prisma.document.findFirst({
      where: {
        id: documentId,
        organisationId: currentActor.organisationId,
        clientId,
        client: { is: getClientDetailAccessWhere(currentActor) },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        archivedAt: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          select: versionSelection,
        },
      },
    });
    const latest = row?.versions[0];
    if (!row || !latest) {
      throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      archivedAt: row.archivedAt,
      latestVersion: mapVersion(latest),
      versions: row.versions.map(mapVersion),
    };
  } catch (error) {
    return publicError(error);
  }
}

async function failed(
  intent: AuditIntentHandle,
  error: unknown,
): Promise<never> {
  await recordFailedAuditOutcome(intent);
  return publicError(error);
}

async function ambiguous(intent: AuditIntentHandle): Promise<never> {
  await recordAmbiguousAuditOutcome(intent);
  throw new DocumentError("OPERATION_AMBIGUOUS");
}

async function recordScanRejection(
  actor: ApplicationUser,
  documentId: string,
): Promise<void> {
  const intent = await createUserAuditIntent({
    operationId: generateAuditOperationId(),
    actor,
    action: "DOCUMENT_SCAN_REJECTED",
    target: { targetId: documentId },
  });
  await recordSucceededAuditOutcome(intent, documentId);
}

type CommitVerification<T> =
  | Readonly<{ state: "COMPLETED"; value: T }>
  | Readonly<{ state: "ROLLED_BACK" }>
  | Readonly<{ state: "UNKNOWN" }>;

async function verifyUploadCommit(
  intent: AuditIntentHandle,
  actor: ApplicationUser,
  input: Readonly<{
    clientId: string;
    documentId: string;
    versionId: string;
    versionNumber: number;
    storageKey: string;
  }>,
): Promise<
  CommitVerification<
    Readonly<{ documentId: string; versionId: string; versionNumber: number }>
  >
> {
  return prisma.$transaction(async (transaction) => {
    await lockClientForMutation(transaction, input.clientId);
    const version = await transaction.documentVersion.findFirst({
      where: {
        id: input.versionId,
        organisationId: actor.organisationId,
        clientId: input.clientId,
        documentId: input.documentId,
        versionNumber: input.versionNumber,
        storageKey: input.storageKey,
      },
      select: { id: true },
    });
    const outcome = await transaction.auditEvent.findUnique({
      where: {
        operationId_type: {
          operationId: intent.operationId,
          type: "OUTCOME",
        },
      },
      select: { result: true, resolvedTargetId: true },
    });
    if (
      version &&
      outcome?.result === "SUCCEEDED" &&
      outcome.resolvedTargetId === input.documentId
    ) {
      return {
        state: "COMPLETED",
        value: {
          documentId: input.documentId,
          versionId: input.versionId,
          versionNumber: input.versionNumber,
        },
      };
    }
    if (!version && !outcome) return { state: "ROLLED_BACK" };
    return { state: "UNKNOWN" };
  });
}

async function verifyArchiveCommit(
  intent: AuditIntentHandle,
  actor: ApplicationUser,
  clientId: string,
  documentId: string,
): Promise<CommitVerification<void>> {
  return prisma.$transaction(async (transaction) => {
    await lockClientForMutation(transaction, clientId);
    const document = await transaction.document.findFirst({
      where: {
        id: documentId,
        organisationId: actor.organisationId,
        clientId,
      },
      select: { status: true, archivedAt: true, archivedByUserId: true },
    });
    const outcome = await transaction.auditEvent.findUnique({
      where: {
        operationId_type: { operationId: intent.operationId, type: "OUTCOME" },
      },
      select: { result: true, resolvedTargetId: true },
    });
    if (
      document?.status === DocumentStatus.ARCHIVED &&
      document.archivedAt &&
      document.archivedByUserId === actor.userId &&
      outcome?.result === "SUCCEEDED" &&
      outcome.resolvedTargetId === documentId
    ) {
      return { state: "COMPLETED", value: undefined };
    }
    if (document?.status === DocumentStatus.ACTIVE && !outcome) {
      return { state: "ROLLED_BACK" };
    }
    return { state: "UNKNOWN" };
  });
}

export type UploadDocumentInternalInput = Readonly<{
  clientId: string;
  documentId?: string;
  metadata: UploadMetadata;
  body: ReadableStream<Uint8Array> | null;
  declaredContentLength: string | null;
}>;

export async function uploadDocumentInternal(
  input: UploadDocumentInternalInput,
  actor: ApplicationUser,
  dependencies: DocumentDependencies,
): Promise<
  Readonly<{ documentId: string; versionId: string; versionNumber: number }>
> {
  if (
    process.env.NODE_ENV !== "test" &&
    (dependencies.runBusinessTransactionForTest ||
      dependencies.beforeCommitVerificationForTest)
  ) {
    throw new Error("Document test dependencies are unavailable.");
  }
  const metadata = uploadMetadataSchema.parse(input.metadata);
  const approvedType = requireApprovedDeclaredType(
    metadata.originalFilename,
    metadata.declaredMediaType,
  );
  const documentId = input.documentId ?? randomUUID();
  const versionId = randomUUID();
  const storageKey = generateDocumentStorageKey();
  let currentActor: ApplicationUser;

  try {
    currentActor = await prisma.$transaction(async (transaction) => {
      const revalidated = await requireClient(
        transaction,
        actor,
        input.clientId,
        "WORK",
      );
      if (input.documentId) {
        const document = await transaction.document.findFirst({
          where: {
            id: input.documentId,
            organisationId: revalidated.organisationId,
            clientId: input.clientId,
            status: DocumentStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!document) {
          throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
        }
      }
      return revalidated;
    });
  } catch (error) {
    return publicError(error);
  }

  const intent = await createUserAuditIntent({
    operationId: metadata.operationId,
    actor: currentActor,
    action: input.documentId ? "DOCUMENT_VERSION_CREATED" : "DOCUMENT_UPLOADED",
    target: { targetId: documentId },
  });

  let quarantineKey: string | null = null;
  let promoted = false;
  let callbackReturned = false;
  let attemptedVersionNumber: number | null = null;
  try {
    const upload = await storeBoundedUpload(
      dependencies.storage,
      input.body,
      input.declaredContentLength,
    );
    quarantineKey = upload.quarantineKey;
    await validateStoredUpload(dependencies.storage, upload, approvedType);
    const scanHandle = await dependencies.storage.openQuarantine(quarantineKey);
    let scan;
    try {
      scan = await dependencies.scanner.scan(scanHandle.createReadStream());
    } finally {
      await scanHandle.close();
    }
    if (scan.status === "REJECTED") {
      await dependencies.storage.removeQuarantine(quarantineKey);
      quarantineKey = null;
      await recordFailedAuditOutcome(intent, documentId);
      await recordScanRejection(currentActor, documentId);
      throw new DocumentError("SCAN_REJECTED");
    }
    await dependencies.storage.promote(quarantineKey, storageKey);
    quarantineKey = null;
    promoted = true;
    await dependencies.beforeBusinessTransaction?.();
    const runBusinessTransaction =
      dependencies.runBusinessTransactionForTest ??
      (<T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>) =>
        prisma.$transaction(callback));
    return await runBusinessTransaction(async (transaction) => {
      await lockClientForMutation(transaction, input.clientId);
      const committedActor = await requireClient(
        transaction,
        actor,
        input.clientId,
        "WORK",
      );
      let versionNumber = 1;
      if (input.documentId) {
        const locked = await transaction.$queryRaw<readonly { id: string }[]>`
          SELECT "id"
          FROM "document"
          WHERE "id" = ${documentId}::uuid
            AND "organisationId" = ${committedActor.organisationId}
            AND "clientId" = ${input.clientId}::uuid
            AND "status" = 'ACTIVE'::"DocumentStatus"
          FOR UPDATE
        `;
        if (locked.length !== 1) {
          throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
        }
        const latest = await transaction.documentVersion.findFirst({
          where: {
            organisationId: committedActor.organisationId,
            clientId: input.clientId,
            documentId,
          },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        if (!latest) throw new DefinitiveDocumentError("INCONSISTENT_RESULT");
        versionNumber = latest.versionNumber + 1;
      } else {
        await transaction.document.create({
          data: {
            id: documentId,
            organisationId: committedActor.organisationId,
            clientId: input.clientId,
            title: metadata.title,
            description: metadata.description,
            createdByUserId: committedActor.userId,
          },
          select: { id: true },
        });
      }
      await transaction.documentVersion.create({
        data: {
          id: versionId,
          organisationId: committedActor.organisationId,
          clientId: input.clientId,
          documentId,
          versionNumber,
          originalFilename: metadata.originalFilename,
          displayFilename: normalizeDisplayFilename(metadata.originalFilename),
          mediaType: approvedType.mediaType,
          approvedExtension: approvedType.extension,
          sizeBytes: BigInt(upload.sizeBytes),
          storageKey,
          sha256: upload.sha256,
          uploadedByUserId: committedActor.userId,
          malwareScanResult: scan.evidence.result,
          malwareScanner: scan.evidence.scanner,
          malwareScannerVersion: scan.evidence.scannerVersion,
          malwareSignatureVersion: scan.evidence.signatureVersion,
          malwareSignatureDate: scan.evidence.signatureDate,
          malwareScannedAt: scan.evidence.scannedAt,
        },
        select: { id: true },
      });
      await dependencies.afterBusinessMutation?.(transaction);
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        documentId,
      );
      attemptedVersionNumber = versionNumber;
      const value = { documentId, versionId, versionNumber };
      callbackReturned = true;
      return value;
    });
  } catch (error) {
    if (error instanceof DocumentError && error.code === "SCAN_REJECTED") {
      throw error;
    }
    if (quarantineKey) {
      await dependencies.storage
        .removeQuarantine(quarantineKey)
        .catch(() => undefined);
    }
    if (callbackReturned) {
      try {
        if (attemptedVersionNumber === null) return ambiguous(intent);
        await dependencies.beforeCommitVerificationForTest?.();
        const verification = await verifyUploadCommit(intent, currentActor, {
          clientId: input.clientId,
          documentId,
          versionId,
          versionNumber: attemptedVersionNumber,
          storageKey,
        });
        if (verification.state === "COMPLETED") return verification.value;
        if (verification.state === "UNKNOWN") return ambiguous(intent);
      } catch {
        return ambiguous(intent);
      }
    }
    if (promoted) {
      await dependencies.storage
        .removeUnreferenced(storageKey)
        .catch(() => undefined);
    }
    return failed(intent, error);
  }
}

export async function archiveDocumentInternal(
  input: Readonly<{
    operationId: string;
    clientId: string;
    documentId: string;
  }>,
  actor: ApplicationUser,
): Promise<void> {
  let currentActor: ApplicationUser;
  try {
    currentActor = await prisma.$transaction(async (transaction) => {
      const revalidated = await requireClient(
        transaction,
        actor,
        input.clientId,
        "WORK",
      );
      if (revalidated.role !== "ADMINISTRATOR") {
        throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
      }
      const document = await transaction.document.findFirst({
        where: {
          id: input.documentId,
          organisationId: revalidated.organisationId,
          clientId: input.clientId,
          status: DocumentStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!document) throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
      return revalidated;
    });
  } catch (error) {
    return publicError(error);
  }
  const intent = await createUserAuditIntent({
    operationId: input.operationId,
    actor: currentActor,
    action: "DOCUMENT_ARCHIVED",
    target: { targetId: input.documentId },
  });
  let callbackReturned = false;
  try {
    await prisma.$transaction(async (transaction) => {
      await lockClientForMutation(transaction, input.clientId);
      const committedActor = await requireClient(
        transaction,
        actor,
        input.clientId,
        "WORK",
      );
      if (committedActor.role !== "ADMINISTRATOR") {
        throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
      }
      const archivedAt = new Date();
      const updated = await transaction.document.updateMany({
        where: {
          id: input.documentId,
          organisationId: committedActor.organisationId,
          clientId: input.clientId,
          status: DocumentStatus.ACTIVE,
          archivedAt: null,
          archivedByUserId: null,
        },
        data: {
          status: DocumentStatus.ARCHIVED,
          archivedAt,
          archivedByUserId: committedActor.userId,
        },
      });
      if (updated.count !== 1) {
        throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
      }
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        input.documentId,
      );
      callbackReturned = true;
    });
  } catch (error) {
    if (callbackReturned) {
      try {
        const verification = await verifyArchiveCommit(
          intent,
          currentActor,
          input.clientId,
          input.documentId,
        );
        if (verification.state === "COMPLETED") return;
        if (verification.state === "UNKNOWN") return ambiguous(intent);
      } catch {
        return ambiguous(intent);
      }
    }
    return failed(intent, error);
  }
}

async function verifyHandleIntegrity(
  handle: DocumentObjectHandle,
  expectedSize: number,
  expectedSha256: string,
): Promise<void> {
  if (handle.size !== expectedSize) {
    throw new DocumentError("INTEGRITY_FAILED");
  }
  const digest = createHash("sha256");
  let size = 0;
  for await (const value of handle.createReadStream()) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    digest.update(chunk);
  }
  if (size !== expectedSize || digest.digest("hex") !== expectedSha256) {
    throw new DocumentError("INTEGRITY_FAILED");
  }
}

export async function authoriseDocumentDownloadInternal(
  input: Readonly<{
    clientId: string;
    documentId: string;
    versionId: string;
  }>,
  actor: ApplicationUser,
  storage: DocumentStorage,
): Promise<DocumentDownload> {
  let handle: DocumentObjectHandle | null = null;
  try {
    const currentActor = await requireClient(
      prisma,
      actor,
      input.clientId,
      "READ",
    );
    const version = await prisma.documentVersion.findFirst({
      where: {
        id: input.versionId,
        organisationId: currentActor.organisationId,
        clientId: input.clientId,
        documentId: input.documentId,
        client: { is: getClientDetailAccessWhere(currentActor) },
        document: {
          is: {
            id: input.documentId,
            organisationId: currentActor.organisationId,
            clientId: input.clientId,
          },
        },
      },
      select: {
        id: true,
        displayFilename: true,
        mediaType: true,
        sizeBytes: true,
        storageKey: true,
        sha256: true,
      },
    });
    if (!version) throw new DefinitiveDocumentError("TARGET_UNAVAILABLE");
    const sizeBytes = Number(version.sizeBytes);
    if (!Number.isSafeInteger(sizeBytes)) {
      throw new DefinitiveDocumentError("INCONSISTENT_RESULT");
    }
    handle = await storage.open(version.storageKey);
    await verifyHandleIntegrity(handle, sizeBytes, version.sha256);
    const intent = await createUserAuditIntent({
      operationId: generateAuditOperationId(),
      actor: currentActor,
      action: "DOCUMENT_DOWNLOAD_AUTHORISED",
      target: { targetId: version.id },
    });
    try {
      await prisma.$transaction(async (transaction) => {
        // Integrity I/O is complete before taking the same short Client lock
        // used by Assignment and lifecycle changes. No stream holds this lock.
        await lockClientForMutation(transaction, input.clientId);
        await requireClient(transaction, actor, input.clientId, "READ");
        await appendAuditOutcomeInTransaction(
          transaction,
          intent,
          "SUCCEEDED",
          version.id,
        );
      });
    } catch (error) {
      // Only an observed access denial proves failure. An unknown transaction
      // result must not be relabelled as a definitive failed authorization.
      if (error instanceof DefinitiveDocumentError) {
        await recordFailedAuditOutcome(intent, version.id);
      }
      throw error;
    }
    return {
      handle,
      displayFilename: version.displayFilename,
      mediaType: version.mediaType,
      sizeBytes,
    };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    return publicError(error);
  }
}
