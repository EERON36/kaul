import Link from "next/link";

import { ApplicationShell } from "@/components/application-shell";
import { listClientDocuments } from "@/modules/documents/documents";

import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../client-workspace-data";
import { ClientWorkspaceHeader } from "../client-workspace";
import {
  formatDocumentDate,
  formatDocumentSize,
  getDocumentFormatLabel,
  getDocumentStatusLabel,
} from "./document-presentation";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  const workspace = await loadClientWorkspace(clientId);
  let documents;
  try {
    documents = await listClientDocuments(clientId);
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  const readOnly = workspace.client.status === "ARCHIVED";

  return (
    <ApplicationShell currentPath="/klienter" user={workspace.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={workspace.client}
          currentSection="documents"
        />
        <section
          aria-labelledby="documents-heading"
          className="client-section document-library"
        >
          <div className="section-heading-with-action">
            <div>
              <h2 id="documents-heading">Dokument</h2>
              <p>Dokument och tidigare versioner för den här klienten.</p>
            </div>
            {!readOnly ? (
              <Link
                className="primary-button button-link"
                href={`/klienter/${clientId}/dokument/nytt`}
              >
                Ladda upp dokument
              </Link>
            ) : null}
          </div>
          {readOnly ? (
            <p className="read-only-notice">
              Klienten är arkiverad. Dokument kan läsas och hämtas, men inte
              ändras.
            </p>
          ) : null}
          {documents.length === 0 ? (
            <p>Inga dokument har laddats upp för klienten.</p>
          ) : (
            <ul className="document-list">
              {documents.map((document) => (
                <li key={document.id}>
                  <div className="document-list-heading">
                    <h3>{document.title}</h3>
                    <span className="status-label">
                      {getDocumentStatusLabel(document.status)}
                    </span>
                  </div>
                  {document.description ? <p>{document.description}</p> : null}
                  <dl className="document-metadata">
                    <div>
                      <dt>Filnamn</dt>
                      <dd>{document.latestVersion.displayFilename}</dd>
                    </div>
                    <div>
                      <dt>Filformat</dt>
                      <dd>
                        {getDocumentFormatLabel(
                          document.latestVersion.mediaType,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Storlek</dt>
                      <dd>
                        {formatDocumentSize(document.latestVersion.sizeBytes)}
                      </dd>
                    </div>
                    <div>
                      <dt>Uppladdad</dt>
                      <dd>
                        <time
                          dateTime={document.latestVersion.uploadedAt.toISOString()}
                        >
                          {formatDocumentDate(
                            document.latestVersion.uploadedAt,
                          )}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt>Uppladdad av</dt>
                      <dd>{document.latestVersion.uploaderName}</dd>
                    </div>
                    <div>
                      <dt>Version</dt>
                      <dd>{document.latestVersion.versionNumber}</dd>
                    </div>
                  </dl>
                  <div className="document-actions">
                    <Link
                      href={`/klienter/${clientId}/dokument/${document.id}`}
                    >
                      Visa historik
                    </Link>
                    <a
                      href={`/api/kaul/clients/${clientId}/documents/${document.id}/versions/${document.latestVersion.id}/download`}
                    >
                      Hämta
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ApplicationShell>
  );
}
