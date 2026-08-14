import Link from "next/link";

import { ApplicationShell } from "@/components/application-shell";
import { listGoals, type GoalRecord } from "@/modules/planning/planning";

import {
  goalStatusLabels,
  formatPlanningDate,
} from "@/app/planning-presentation";
import { ClientWorkspaceHeader } from "../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../client-workspace-data";

export const dynamic = "force-dynamic";

function GoalGroup({
  clientId,
  emptyText,
  goals,
  heading,
  headingId,
}: Readonly<{
  clientId: string;
  emptyText: string;
  goals: readonly GoalRecord[];
  heading: string;
  headingId: string;
}>) {
  return (
    <section aria-labelledby={headingId} className="planning-group">
      <h3 id={headingId}>{heading}</h3>
      {goals.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <ul className="planning-list">
          {goals.map((goal) => (
            <li key={goal.id}>
              <Link
                className="planning-list-link"
                href={`/klienter/${clientId}/mal/${goal.id}`}
              >
                <span className="planning-list-heading">
                  <strong>{goal.title}</strong>
                  <span>{goalStatusLabels[goal.status]}</span>
                </span>
                <span>
                  <strong>Startdatum:</strong>{" "}
                  <time dateTime={goal.startDate.toISOString()}>
                    {formatPlanningDate(goal.startDate)}
                  </time>
                </span>
                {goal.targetDate ? (
                  <span>
                    <strong>Måldatum:</strong>{" "}
                    <time dateTime={goal.targetDate.toISOString()}>
                      {formatPlanningDate(goal.targetDate)}
                    </time>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function GoalsPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  const result = await loadClientWorkspace(clientId);
  let goals;
  try {
    goals = await listGoals({ clientId });
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader client={result.client} currentSection="goals" />
        <section aria-labelledby="goals-heading" className="client-section">
          <div className="planning-page-heading">
            <div>
              <h2 id="goals-heading">Mål</h2>
              <p>Gemensamma områden som klienten arbetar mot.</p>
            </div>
            {result.client.status !== "ARCHIVED" ? (
              <Link
                className="primary-button button-link"
                href={`/klienter/${clientId}/mal/nytt`}
              >
                Nytt mål
              </Link>
            ) : null}
          </div>
          {result.client.status === "ARCHIVED" ? (
            <p className="planning-read-only">
              Klienten är arkiverad. Målen visas skrivskyddat.
            </p>
          ) : null}
          <GoalGroup
            clientId={clientId}
            emptyText="Det finns inga aktiva eller pausade mål."
            goals={goals.filter(
              (goal) => goal.status === "ACTIVE" || goal.status === "PAUSED",
            )}
            heading="Aktuella mål"
            headingId="current-goals-heading"
          />
          <GoalGroup
            clientId={clientId}
            emptyText="Det finns inga slutförda mål."
            goals={goals.filter((goal) => goal.status === "COMPLETED")}
            heading="Slutförda mål"
            headingId="completed-goals-heading"
          />
          <GoalGroup
            clientId={clientId}
            emptyText="Det finns inga arkiverade mål."
            goals={goals.filter((goal) => goal.status === "ARCHIVED")}
            heading="Arkiverade mål"
            headingId="archived-goals-heading"
          />
        </section>
      </div>
    </ApplicationShell>
  );
}
