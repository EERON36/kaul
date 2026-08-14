import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { generateAuditOperationId } from "@/modules/audit/audit";
import {
  getCurrentJournalDraft,
  JOURNAL_ENTRY_TYPE_LABELS,
  listAvailableJournalGoals,
} from "@/modules/journal/journal";

import { ClientWorkspaceHeader } from "../../../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../../client-workspace-data";
import { SignJournalControl } from "../../journal-mutation-controls-client";
import { formatJournalDateTime } from "../../journal-presentation";

export const dynamic = "force-dynamic";

export default async function JournalReviewPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  const result = await loadClientWorkspace(clientId);
  if (result.client.status === "ARCHIVED") notFound();

  let draft;
  let goals;
  try {
    [draft, goals] = await Promise.all([
      getCurrentJournalDraft({ clientId }),
      listAvailableJournalGoals({ clientId }),
    ]);
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  if (!draft) notFound();

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="journal"
        />
        <article aria-labelledby="review-heading" className="journal-record">
          <p className="eyebrow">Granska inför signering</p>
          <h2 id="review-heading">
            {draft.correctionOf
              ? `Rättelse av anteckning ${draft.correctionOf.reference}`
              : "Anteckning"}
          </h2>
          {draft.correctionOf ? (
            <p>
              <strong>Rättelse av:</strong>{" "}
              <Link
                className="journal-reference"
                href={`/klienter/${clientId}/anteckningar/${draft.correctionOf.id}`}
              >
                {draft.correctionOf.reference}
              </Link>
            </p>
          ) : null}
          <dl className="journal-metadata">
            <div>
              <dt>Personreferens</dt>
              <dd className="client-identifier">
                {result.client.personIdentifier}
              </dd>
            </div>
            <div>
              <dt>Typ av anteckning</dt>
              <dd>{JOURNAL_ENTRY_TYPE_LABELS[draft.entryType]}</dd>
            </div>
            <div>
              <dt>Händelsetid</dt>
              <dd>
                <time dateTime={draft.eventOccurredAt.toISOString()}>
                  {formatJournalDateTime(draft.eventOccurredAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Författare</dt>
              <dd>{result.user.name}</dd>
            </div>
          </dl>
          <section
            aria-labelledby="review-content-heading"
            className="journal-content-section"
          >
            <h3 id="review-content-heading">Anteckning</h3>
            <div className="journal-content">{draft.content}</div>
          </section>
          <section
            aria-labelledby="review-goals-heading"
            className="journal-goal-context"
          >
            <h3 id="review-goals-heading">Valda mål</h3>
            {draft.goalReferences.length === 0 ? (
              <p>Inga mål är valda.</p>
            ) : (
              <ul>
                {draft.goalReferences.map((reference) => {
                  const goal = goals.find(({ id }) => id === reference.goalId);
                  return (
                    <li key={reference.goalId}>
                      {goal?.title ?? "Mål kan inte visas"}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <p className="journal-signing-warning">
            När du signerar kan anteckningen inte längre ändras. Fel rättas
            genom en separat rättelse.
          </p>
          <div className="journal-review-actions">
            <SignJournalControl
              journalEntryId={draft.id}
              operationId={generateAuditOperationId()}
              version={draft.version}
            />
            <Link
              className="secondary-button button-link"
              href={`/klienter/${clientId}/anteckningar/utkast`}
            >
              Tillbaka till utkastet
            </Link>
          </div>
        </article>
      </div>
    </ApplicationShell>
  );
}
