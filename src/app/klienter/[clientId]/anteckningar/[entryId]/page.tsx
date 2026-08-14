import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import {
  getSignedJournalEntry,
  JOURNAL_ENTRY_TYPE_LABELS,
} from "@/modules/journal/journal";

import { ClientWorkspaceHeader } from "../../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../client-workspace-data";
import { BeginJournalCorrectionControl } from "../journal-mutation-controls-client";
import {
  formatJournalDateTime,
  getJournalSignerRoleLabel,
} from "../journal-presentation";

export const dynamic = "force-dynamic";

export default async function SignedJournalEntryPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ clientId: string; entryId: string }>;
  searchParams: Promise<{ signerad?: string | string[] }>;
}>) {
  const { clientId, entryId } = await params;
  const query = await searchParams;
  const result = await loadClientWorkspace(clientId);

  let entry;
  try {
    entry = await getSignedJournalEntry({ journalEntryId: entryId });
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  if (entry.clientId !== result.client.id) notFound();

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="journal"
        />
        {query.signerad === "klar" ? (
          <p aria-live="polite" className="form-status" role="status">
            Anteckningen har signerats.
          </p>
        ) : null}

        <article
          aria-labelledby="signed-entry-heading"
          className="journal-record"
        >
          <p className="eyebrow">Signerad anteckning</p>
          <h2 id="signed-entry-heading">
            {JOURNAL_ENTRY_TYPE_LABELS[entry.entryType]}
          </h2>
          <p className="journal-reference">{entry.reference}</p>

          {entry.correctionOf ? (
            <p>
              <strong>Rättelse av:</strong>{" "}
              <Link
                className="journal-reference"
                href={`/klienter/${clientId}/anteckningar/${entry.correctionOf.id}`}
              >
                {entry.correctionOf.reference}
              </Link>
            </p>
          ) : null}

          <dl className="journal-metadata">
            <div>
              <dt>Typ av anteckning</dt>
              <dd>{JOURNAL_ENTRY_TYPE_LABELS[entry.entryType]}</dd>
            </div>
            <div>
              <dt>Händelsetid</dt>
              <dd>
                <time dateTime={entry.eventOccurredAt.toISOString()}>
                  {formatJournalDateTime(entry.eventOccurredAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Signerad</dd>
            </div>
          </dl>

          <section
            aria-labelledby="signed-content-heading"
            className="journal-content-section"
          >
            <h3 id="signed-content-heading">Anteckning</h3>
            <div className="journal-content">{entry.content}</div>
          </section>

          {entry.goalReferences.length > 0 ? (
            <section
              aria-labelledby="signed-goals-heading"
              className="journal-goal-context"
            >
              <h3 id="signed-goals-heading">Mål vid signering</h3>
              <ul>
                {entry.goalReferences.map((reference) => (
                  <li key={reference.goalId}>
                    {reference.titleSnapshot ?? "Uppgift saknas"}
                  </li>
                ))}
              </ul>
              <p className="form-help">
                Titlarna bevaras som de såg ut när anteckningen signerades.
              </p>
            </section>
          ) : null}

          <section
            aria-labelledby="signing-heading"
            className="journal-signature"
          >
            <h3 id="signing-heading">Signering</h3>
            <dl className="journal-metadata">
              <div>
                <dt>Författare</dt>
                <dd>{entry.signerName ?? "Uppgift saknas"}</dd>
              </div>
              <div>
                <dt>Yrkestitel vid signering</dt>
                <dd>{entry.signerProfessionalTitle ?? "Uppgift saknas"}</dd>
              </div>
              <div>
                <dt>Roll vid signering</dt>
                <dd>{getJournalSignerRoleLabel(entry.signerRole)}</dd>
              </div>
              <div>
                <dt>Signerad den</dt>
                <dd>
                  {entry.signedAt ? (
                    <time dateTime={entry.signedAt.toISOString()}>
                      {formatJournalDateTime(entry.signedAt)}
                    </time>
                  ) : (
                    "Uppgift saknas"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {!entry.correctionOf && entry.corrections.length > 0 ? (
            <section
              aria-labelledby="corrections-heading"
              className="journal-corrections"
            >
              <h3 id="corrections-heading">Rättelser</h3>
              <ul>
                {entry.corrections.map((correction) => (
                  <li key={correction.id}>
                    <Link
                      className="journal-reference"
                      href={`/klienter/${clientId}/anteckningar/${correction.id}`}
                    >
                      {correction.reference}
                    </Link>
                    {" – "}
                    <time dateTime={correction.eventOccurredAt.toISOString()}>
                      {formatJournalDateTime(correction.eventOccurredAt)}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!entry.correctionOf && result.client.status !== "ARCHIVED" ? (
            <BeginJournalCorrectionControl
              clientId={clientId}
              originalEntryId={entry.id}
            />
          ) : null}
        </article>
      </div>
    </ApplicationShell>
  );
}
