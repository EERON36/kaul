import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { generateAuditOperationId } from "@/modules/audit/audit";
import { getGoal } from "@/modules/planning/planning";

import {
  formatPlanningDate,
  formatPlanningDateTime,
  goalStatusLabels,
} from "@/app/planning-presentation";
import { ClientWorkspaceHeader } from "../../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../client-workspace-data";
import { GoalLifecycleControl } from "../goal-lifecycle-client";

export const dynamic = "force-dynamic";

export default async function GoalDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ clientId: string; goalId: string }>;
  searchParams: Promise<{
    skapat?: string | string[];
    sparat?: string | string[];
    status?: string | string[];
  }>;
}>) {
  const { clientId, goalId } = await params;
  const query = await searchParams;
  const result = await loadClientWorkspace(clientId);
  let goal;
  try {
    goal = await getGoal({ goalId });
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  if (goal.clientId !== result.client.id) notFound();
  const editable =
    result.client.status !== "ARCHIVED" &&
    (goal.status === "ACTIVE" || goal.status === "PAUSED");

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader client={result.client} currentSection="goals" />
        {query.skapat === "klar" ? (
          <p aria-live="polite" className="form-status" role="status">
            Målet har skapats.
          </p>
        ) : null}
        {query.sparat === "klar" ? (
          <p aria-live="polite" className="form-status" role="status">
            Målet har sparats.
          </p>
        ) : null}
        {query.status === "andrad" ? (
          <p aria-live="polite" className="form-status" role="status">
            Målets status har ändrats.
          </p>
        ) : null}
        <article aria-labelledby="goal-heading" className="planning-record">
          <p className="eyebrow">Mål</p>
          <h2 id="goal-heading">{goal.title}</h2>
          <dl className="planning-metadata">
            <div>
              <dt>Status</dt>
              <dd>{goalStatusLabels[goal.status]}</dd>
            </div>
            <div>
              <dt>Startdatum</dt>
              <dd>
                <time dateTime={goal.startDate.toISOString()}>
                  {formatPlanningDate(goal.startDate)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Måldatum eller uppföljning</dt>
              <dd>
                {goal.targetDate ? (
                  <time dateTime={goal.targetDate.toISOString()}>
                    {formatPlanningDate(goal.targetDate)}
                  </time>
                ) : (
                  "Inte angivet"
                )}
              </dd>
            </div>
            {goal.status === "COMPLETED" ? (
              <div>
                <dt>Slutförd den</dt>
                <dd>
                  {goal.completedAt ? (
                    <time dateTime={goal.completedAt.toISOString()}>
                      {formatPlanningDateTime(goal.completedAt)}
                    </time>
                  ) : (
                    "Uppgift saknas"
                  )}
                </dd>
              </div>
            ) : null}
            {goal.status === "ARCHIVED" ? (
              <div>
                <dt>Arkiverad den</dt>
                <dd>
                  {goal.archivedAt ? (
                    <time dateTime={goal.archivedAt.toISOString()}>
                      {formatPlanningDateTime(goal.archivedAt)}
                    </time>
                  ) : (
                    "Uppgift saknas"
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          {goal.description ? (
            <section
              aria-labelledby="goal-description-heading"
              className="planning-description"
            >
              <h3 id="goal-description-heading">Beskrivning</h3>
              <div>{goal.description}</div>
            </section>
          ) : null}
          {editable ? (
            <div className="planning-actions">
              <Link
                className="secondary-button button-link"
                href={`/klienter/${clientId}/mal/${goal.id}/redigera`}
              >
                Redigera
              </Link>
              <GoalLifecycleControl
                goalId={goal.id}
                operationId={generateAuditOperationId()}
                transition={goal.status === "ACTIVE" ? "pause" : "resume"}
                version={goal.version}
              />
              <GoalLifecycleControl
                goalId={goal.id}
                operationId={generateAuditOperationId()}
                transition="complete"
                version={goal.version}
              />
              <GoalLifecycleControl
                goalId={goal.id}
                operationId={generateAuditOperationId()}
                transition="archive"
                version={goal.version}
              />
            </div>
          ) : (
            <p className="planning-read-only">
              {result.client.status === "ARCHIVED"
                ? "Klienten är arkiverad. Målet visas skrivskyddat."
                : "Målet är historik och kan inte redigeras eller återupptas."}
            </p>
          )}
        </article>
      </div>
    </ApplicationShell>
  );
}
