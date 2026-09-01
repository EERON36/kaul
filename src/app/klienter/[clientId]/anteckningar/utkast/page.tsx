import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { NavigationGuardProvider } from "@/components/navigation-guard";
import {
  getCurrentJournalDraft,
  listAvailableJournalGoals,
} from "@/modules/journal/journal";

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
  let goals;
  try {
    [draft, goals] = await Promise.all([
      getCurrentJournalDraft({ clientId }),
      listAvailableJournalGoals({ clientId }),
    ]);
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
      healthContent: draft?.healthContent ?? "",
      educationOccupationContent: draft?.educationOccupationContent ?? "",
      emotionsBehaviorContent: draft?.emotionsBehaviorContent ?? "",
      socialRelationsContent: draft?.socialRelationsContent ?? "",
      dailyLivingIndependenceContent:
        draft?.dailyLivingIndependenceContent ?? "",
      otherContent:
        draft?.contentFormat === "LEGACY_NARRATIVE"
          ? draft.content
          : (draft?.otherContent ?? ""),
      goalIds: draft?.goalReferences.map(({ goalId }) => goalId) ?? [],
    },
    journalEntryId: draft?.id,
    version: draft?.version,
  };

  return (
    <NavigationGuardProvider confirmationMessage="Du har osparade ändringar i anteckningen. Vill du lämna sidan? Ändringarna försvinner om du inte sparar dem.">
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
            <JournalDraftForm
              clientId={clientId}
              goals={goals}
              initialState={initialState}
            />
          </section>
        </div>
      </ApplicationShell>
    </NavigationGuardProvider>
  );
}
