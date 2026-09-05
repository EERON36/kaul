import "server-only";

import { requireApplicationUser } from "../authentication/guards";
import { getDocumentEnvironment } from "./document-environment";
import {
  ClamAvDocumentScanner,
  type DocumentMalwareScanner,
} from "./document-malware-scanner";
import {
  archiveDocumentInputSchema,
  documentRouteIdentitySchema,
  uploadMetadataSchema,
  type UploadMetadata,
} from "./document-input";
import {
  FileSystemDocumentStorage,
  type DocumentStorage,
} from "./document-storage";
import {
  archiveDocumentInternal,
  authoriseDocumentDownloadInternal,
  getDocumentDetailInternal,
  listClientDocumentsInternal,
  uploadDocumentInternal,
} from "./documents-internal";

let dependencies:
  | Readonly<{ storage: DocumentStorage; scanner: DocumentMalwareScanner }>
  | undefined;

function getDependencies() {
  if (!dependencies) {
    const environment = getDocumentEnvironment();
    dependencies = {
      storage: new FileSystemDocumentStorage(environment.DOCUMENT_STORAGE_ROOT),
      scanner: new ClamAvDocumentScanner({
        host: environment.DOCUMENT_SCANNER_HOST,
        port: environment.DOCUMENT_SCANNER_PORT,
        timeoutMs: environment.DOCUMENT_SCANNER_TIMEOUT_MS,
        maxSignatureAgeHours: environment.DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS,
      }),
    };
  }
  return dependencies;
}

export async function listClientDocuments(clientId: string) {
  const actor = await requireApplicationUser();
  const parsed = documentRouteIdentitySchema
    .pick({ clientId: true })
    .parse({ clientId });
  return listClientDocumentsInternal(parsed.clientId, actor);
}

export async function getDocumentDetail(clientId: string, documentId: string) {
  const actor = await requireApplicationUser();
  const parsed = documentRouteIdentitySchema
    .omit({ versionId: true })
    .parse({ clientId, documentId });
  return getDocumentDetailInternal(parsed.clientId, parsed.documentId, actor);
}

export async function uploadDocument(
  input: Readonly<{
    clientId: string;
    documentId?: string;
    metadata: UploadMetadata;
    body: ReadableStream<Uint8Array> | null;
    declaredContentLength: string | null;
  }>,
) {
  const actor = await requireApplicationUser();
  const identity = documentRouteIdentitySchema
    .omit({ versionId: true })
    .partial({ documentId: true })
    .parse({ clientId: input.clientId, documentId: input.documentId });
  return uploadDocumentInternal(
    {
      ...input,
      clientId: identity.clientId,
      documentId: identity.documentId,
      metadata: uploadMetadataSchema.parse(input.metadata),
    },
    actor,
    getDependencies(),
  );
}

export async function archiveDocument(input: unknown) {
  const actor = await requireApplicationUser();
  return archiveDocumentInternal(
    archiveDocumentInputSchema.parse(input),
    actor,
  );
}

export async function authoriseDocumentDownload(input: unknown) {
  const actor = await requireApplicationUser();
  const parsed = documentRouteIdentitySchema
    .required({ versionId: true })
    .parse(input);
  return authoriseDocumentDownloadInternal(
    {
      clientId: parsed.clientId,
      documentId: parsed.documentId,
      versionId: parsed.versionId,
    },
    actor,
    getDependencies().storage,
  );
}
