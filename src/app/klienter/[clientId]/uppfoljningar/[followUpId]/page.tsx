import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { generateAuditOperationId } from "@/modules/audit/audit";
import { getFollowUp } from "@/modules/planning/planning";

import {
  followUpStatusLabels,
  formatPlanningDateTime,
  getFollowUpDuePresentation,
} from "@/app/planning-presentation";
import { ClientWorkspaceHeader } from "../../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../client-workspace-data";
import { FollowUpLifecycleControl } from "../follow-up-controls-client";

export const dynamic = "force-dynamic";

export default async function FollowUpDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ clientId: string; followUpId: string }>;
  searchParams: Promise<{
    skapad?: string | string[];
    sparad?: string | string[];
    ansvarig?: string | string[];
    status?: string | string[];
  }>;
}>) {
  const { clientId, followUpId } = await params;
  const query = await searchParams;
  const result = await loadClientWorkspace(clientId);
  let followUp;
  try {
    followUp = await getFollowUp({ followUpId });
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  if (followUp.clientId !== result.client.id) notFound();
  const editable =
    result.client.status !== "ARCHIVED" && followUp.status === "PLANNED";
  const due = getFollowUpDuePresentation(followUp);

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="follow-ups"
        />
        {query.skapad === "klar" ? (
          <p aria-live="polite" className="form-status" role="status">
            Uppföljningen har skapats.
          </p>
        ) : null}
        {query.sparad === "klar" ? (
          <p aria-live="polite" className="form-status" role="status">
            Uppföljningen har sparats.
          </p>
        ) : null}
        {query.ansvarig === "sparad" ? (
          <p aria-live="polite" className="form-status" role="status">
            Ansvarig har uppdaterats.
          </p>
        ) : null}
        {query.status === "andrad" ? (
          <p aria-live="polite" className="form-status" role="status">
            Uppföljningens status har ändrats.
          </p>
        ) : null}
        <article
          aria-labelledby="follow-up-heading"
          className="planning-record"
        >
          <p className="eyebrow">Uppföljning</p>
          <h2 id="follow-up-heading">{followUp.title}</h2>
          <dl className="planning-metadata">
            <div>
              <dt>Status</dt>
              <dd>{followUpStatusLabels[followUp.status]}</dd>
            </div>
            <div>
              <dt>Datum för uppföljning</dt>
              <dd>
                {followUp.status === "PLANNED" ? `${due.label}: ` : null}
                {due.value}
              </dd>
            </div>
            {followUp.status === "COMPLETED" ? (
              <div>
                <dt>Slutförd den</dt>
                <dd>
                  {followUp.completedAt ? (
                    <time dateTime={followUp.completedAt.toISOString()}>
                      {formatPlanningDateTime(followUp.completedAt)}
                    </time>
                  ) : (
                    "Uppgift saknas"
                  )}
                </dd>
              </div>
            ) : null}
            {followUp.status === "CANCELLED" ? (
              <div>
                <dt>Avbruten den</dt>
                <dd>
                  {followUp.cancelledAt ? (
                    <time dateTime={followUp.cancelledAt.toISOString()}>
                      {formatPlanningDateTime(followUp.cancelledAt)}
                    </time>
                  ) : (
                    "Uppgift saknas"
                  )}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Ansvarig medarbetare</dt>
              <dd>
                {followUp.responsibleUser.name}
                <span className="metadata-secondary">
                  {followUp.responsibleUser.professionalTitle}
                </span>
              </dd>
            </div>
            <div>
              <dt>Kopplat mål</dt>
              <dd>
                {followUp.goal ? (
                  <Link href={`/klienter/${clientId}/mal/${followUp.goal.id}`}>
                    {followUp.goal.title}
                  </Link>
                ) : (
                  "Inget kopplat mål"
                )}
              </dd>
            </div>
          </dl>
          {followUp.responsibilityNeedsReassignment ? (
            <p className="planning-attention">
              <strong>Ansvar behöver uppdateras.</strong> Den registrerade
              ansvariga personen saknar aktuell behörighet till klienten.
              Uppföljningen har inte tilldelats någon annan automatiskt.
            </p>
          ) : null}
          {followUp.description ? (
            <section
              aria-labelledby="follow-up-description-heading"
              className="planning-description"
            >
              <h3 id="follow-up-description-heading">Beskrivning</h3>
              <div>{followUp.description}</div>
            </section>
          ) : null}
          {editable ? (
            <div className="planning-actions">
              <Link
                className="secondary-button button-link"
                href={`/klienter/${clientId}/uppfoljningar/${followUp.id}/redigera`}
              >
                Redigera uppföljning
              </Link>
              <Link
                className="secondary-button button-link"
                href={`/klienter/${clientId}/uppfoljningar/${followUp.id}/ansvarig`}
              >
                Byt ansvarig
              </Link>
              <FollowUpLifecycleControl
                followUpId={followUp.id}
                operationId={generateAuditOperationId()}
                transition="complete"
                version={followUp.version}
              />
              <FollowUpLifecycleControl
                followUpId={followUp.id}
                operationId={generateAuditOperationId()}
                transition="cancel"
                version={followUp.version}
              />
            </div>
          ) : (
            <p className="planning-read-only">
              {result.client.status === "ARCHIVED"
                ? "Klienten är arkiverad. Uppföljningen visas skrivskyddat."
                : "Uppföljningen är historik och kan inte redigeras, tilldelas om eller återupptas."}
            </p>
          )}
          {followUp.responsibilityHistory.length > 0 ? (
            <section
              aria-labelledby="responsibility-history-heading"
              className="planning-history"
            >
              <h3 id="responsibility-history-heading">Tidigare ansvar</h3>
              <ol>
                {followUp.responsibilityHistory.map((change) => (
                  <li key={change.id}>
                    <span>
                      {change.previousResponsibleUser.name} →{" "}
                      {change.newResponsibleUser.name}
                    </span>
                    <span>
                      Ändrad av {change.actorUser.name}{" "}
                      <time dateTime={change.changedAt.toISOString()}>
                        {formatPlanningDateTime(change.changedAt)}
                      </time>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </article>
      </div>
    </ApplicationShell>
  );
}
