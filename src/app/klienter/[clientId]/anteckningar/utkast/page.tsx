import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { getCurrentJournalDraft } from "@/modules/journal/journal";

import { ClientWorkspaceHeader } from "../../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../client-workspace-data";
import type { JournalDraftActionState } from "../actions";
import { JournalDraftForm } from "../journal-draft-form-client";
import { formatJournalFormDateTime } from "../journal-form-values";

export const dynamic = "force-dynamic";

export default async function JournalDraftPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  const result = await loadClientWorkspace(clientId);
  if (result.client.status === "ARCHIVED") notFound();

  let draft;
  try {
    draft = await getCurrentJournalDraft({ clientId });
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }

  const localEvent = formatJournalFormDateTime(
    draft?.eventOccurredAt ?? new Date(),
  );
  const initialState: JournalDraftActionState = {
    status: "IDLE",
    values: {
      entryType: draft?.entryType ?? "DAILY_NOTE",
      eventDate: localEvent.eventDate,
      eventTime: localEvent.eventTime,
      content: draft?.content ?? "",
    },
    journalEntryId: draft?.id,
    version: draft?.version,
  };

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="journal"
        />
        <section aria-labelledby="draft-heading" className="client-section">
          <p className="eyebrow">Utkast</p>
          <h2 id="draft-heading">
            {draft?.correctionOf
              ? `Rättelse av anteckning ${draft.correctionOf.reference}`
              : "Ny anteckning"}
          </h2>
          {draft?.correctionOf ? (
            <p className="journal-immutability-notice">
              Originalet är signerat och kan inte ändras.
            </p>
          ) : null}
          <JournalDraftForm clientId={clientId} initialState={initialState} />
        </section>
      </div>
    </ApplicationShell>
  );
}
