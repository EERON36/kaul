import Link from "next/link";

import { ApplicationShell } from "@/components/application-shell";
import {
  getCurrentJournalDraft,
  JOURNAL_ENTRY_TYPE_LABELS,
  listSignedJournalEntries,
} from "@/modules/journal/journal";

import { ClientWorkspaceHeader } from "../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../client-workspace-data";
import { formatJournalDateTime } from "./journal-presentation";

export const dynamic = "force-dynamic";

export default async function JournalPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ utkast?: string | string[] }>;
}>) {
  const { clientId } = await params;
  const query = await searchParams;
  const result = await loadClientWorkspace(clientId);

  let ownDraft = null;
  let signedEntries;
  try {
    signedEntries = await listSignedJournalEntries({ clientId });
    if (result.client.status !== "ARCHIVED") {
      ownDraft = await getCurrentJournalDraft({ clientId });
    }
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="journal"
        />

        <section aria-labelledby="journal-heading" className="client-section">
          <h2 id="journal-heading">Anteckningar</h2>
          {query.utkast === "kastat" ? (
            <p aria-live="polite" className="form-status" role="status">
              Utkastet har kastats.
            </p>
          ) : null}

          {result.client.status === "ARCHIVED" ? (
            <p>Klienten är arkiverad. Anteckningar visas skrivskyddat.</p>
          ) : ownDraft ? (
            <div className="journal-own-draft">
              <p>Du har ett öppet utkast för den här klienten.</p>
              <Link
                className="primary-button button-link"
                href={`/klienter/${clientId}/anteckningar/utkast`}
              >
                Öppna utkast
              </Link>
            </div>
          ) : (
            <div className="journal-own-draft">
              <p>Du har inget öppet utkast för den här klienten.</p>
              <Link
                className="primary-button button-link"
                href={`/klienter/${clientId}/anteckningar/utkast`}
              >
                Ny anteckning
              </Link>
            </div>
          )}
        </section>

        <section
          aria-labelledby="signed-history-heading"
          className="client-section"
        >
          <h2 id="signed-history-heading">Signerade anteckningar</h2>
          {signedEntries.length === 0 ? (
            <p>
              Inga signerade anteckningar har registrerats för klienten ännu.
            </p>
          ) : (
            <ol className="journal-history-list">
              {signedEntries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    className="journal-history-link"
                    href={`/klienter/${clientId}/anteckningar/${entry.id}`}
                  >
                    <span className="journal-history-heading">
                      <strong>
                        {JOURNAL_ENTRY_TYPE_LABELS[entry.entryType]}
                      </strong>
                      <span>Signerad</span>
                    </span>
                    <span>
                      <strong>Händelsetid:</strong>{" "}
                      <time dateTime={entry.eventOccurredAt.toISOString()}>
                        {formatJournalDateTime(entry.eventOccurredAt)}
                      </time>
                    </span>
                    <span>
                      <strong>Författare:</strong>{" "}
                      {entry.signerName ?? "Uppgift saknas"}
                    </span>
                    {entry.signedAt ? (
                      <span>
                        <strong>Signerad den:</strong>{" "}
                        <time dateTime={entry.signedAt.toISOString()}>
                          {formatJournalDateTime(entry.signedAt)}
                        </time>
                      </span>
                    ) : null}
                    <span className="journal-reference">{entry.reference}</span>
                    {entry.correctionOf ? (
                      <span>Rättelse av {entry.correctionOf.reference}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </ApplicationShell>
  );
}
