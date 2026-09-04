import { ApplicationShell } from "@/components/application-shell";
import {
  NavigationGuardLink as Link,
  NavigationGuardProvider,
} from "@/components/navigation-guard";
import { generateAuditOperationId } from "@/modules/audit/audit";
import { getDocumentDetail } from "@/modules/documents/documents";

import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../client-workspace-data";
import { ClientWorkspaceHeader } from "../../client-workspace";
import { DocumentArchive } from "../document-archive-client";
import {
  formatDocumentDate,
  formatDocumentSize,
  getDocumentFormatLabel,
  getDocumentStatusLabel,
} from "../document-presentation";
import { DocumentUpload } from "../document-upload-client";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ clientId: string; documentId: string }>;
  searchParams: Promise<{
    uppladdad?: string | string[];
    arkiverat?: string | string[];
  }>;
}>) {
  const { clientId, documentId } = await params;
  const query = await searchParams;
  const workspace = await loadClientWorkspace(clientId);
  let document;
  try {
    document = await getDocumentDetail(clientId, documentId);
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  const clientReadOnly = workspace.client.status === "ARCHIVED";
  const canAddVersion = !clientReadOnly && document.status === "ACTIVE";
  const canArchive = canAddVersion && workspace.user.role === "ADMINISTRATOR";

  return (
    <NavigationGuardProvider confirmationMessage="Du har valt en ny dokumentversion som inte har laddats upp. Vill du lämna sidan? Valet försvinner.">
      <ApplicationShell currentPath="/klienter" user={workspace.user}>
        <div className="page-content">
          <ClientWorkspaceHeader
            client={workspace.client}
            currentSection="documents"
          />
          <p>
            <Link href={`/klienter/${clientId}/dokument`}>
              Tillbaka till Dokument
            </Link>
          </p>
          <section
            className="client-section"
            aria-labelledby="document-heading"
          >
            <div className="document-list-heading">
              <h2 id="document-heading">{document.title}</h2>
              <span className="status-label">
                {getDocumentStatusLabel(document.status)}
              </span>
            </div>
            {document.description ? <p>{document.description}</p> : null}
            {query.uppladdad === "klar" ? (
              <p aria-live="polite" className="form-status" role="status">
                Dokumentet har laddats upp.
              </p>
            ) : null}
            {query.arkiverat === "klar" ? (
              <p aria-live="polite" className="form-status" role="status">
                Dokumentet har arkiverats.
              </p>
            ) : null}
            {clientReadOnly ? (
              <p className="read-only-notice">
                Klienten är arkiverad. Dokumentet är skrivskyddat.
              </p>
            ) : document.status === "ARCHIVED" ? (
              <p className="read-only-notice">
                Dokumentet är arkiverat. Versionerna bevaras och kan hämtas.
              </p>
            ) : null}
            {canArchive ? (
              <DocumentArchive
                clientId={clientId}
                documentId={documentId}
                operationId={generateAuditOperationId()}
              />
            ) : null}
          </section>

          <section
            className="client-section"
            aria-labelledby="versions-heading"
          >
            <h2 id="versions-heading">Versionshistorik</h2>
            <ol className="document-list version-list">
              {document.versions.map((version) => (
                <li key={version.id}>
                  <h3>Version {version.versionNumber}</h3>
                  <dl className="document-metadata">
                    <div>
                      <dt>Filnamn</dt>
                      <dd>{version.displayFilename}</dd>
                    </div>
                    <div>
                      <dt>Filformat</dt>
                      <dd>{getDocumentFormatLabel(version.mediaType)}</dd>
                    </div>
                    <div>
                      <dt>Storlek</dt>
                      <dd>{formatDocumentSize(version.sizeBytes)}</dd>
                    </div>
                    <div>
                      <dt>Uppladdad</dt>
                      <dd>
                        <time dateTime={version.uploadedAt.toISOString()}>
                          {formatDocumentDate(version.uploadedAt)}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt>Uppladdad av</dt>
                      <dd>{version.uploaderName}</dd>
                    </div>
                  </dl>
                  <a
                    href={`/api/kaul/clients/${clientId}/documents/${documentId}/versions/${version.id}/download`}
                  >
                    Hämta version {version.versionNumber}
                  </a>
                </li>
              ))}
            </ol>
          </section>

          {canAddVersion ? (
            <section
              className="client-section"
              aria-labelledby="new-version-heading"
            >
              <h2 id="new-version-heading">Ladda upp ny version</h2>
              <p>
                Den tidigare versionen bevaras oförändrad. Titel och beskrivning
                behålls.
              </p>
              <DocumentUpload
                clientId={clientId}
                documentId={documentId}
                initialDescription={document.description ?? ""}
                initialTitle={document.title}
              />
            </section>
          ) : null}
        </div>
      </ApplicationShell>
    </NavigationGuardProvider>
  );
}
