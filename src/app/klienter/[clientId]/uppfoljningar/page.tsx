import Link from "next/link";

import { ApplicationShell } from "@/components/application-shell";
import {
  listFollowUps,
  type FollowUpRecord,
} from "@/modules/planning/planning";

import {
  followUpStatusLabels,
  getFollowUpDuePresentation,
} from "@/app/planning-presentation";
import { ClientWorkspaceHeader } from "../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../client-workspace-data";

export const dynamic = "force-dynamic";

function FollowUpGroup({
  clientId,
  emptyText,
  followUps,
  heading,
  headingId,
  now,
}: Readonly<{
  clientId: string;
  emptyText: string;
  followUps: readonly FollowUpRecord[];
  heading: string;
  headingId: string;
  now: Date;
}>) {
  return (
    <section aria-labelledby={headingId} className="planning-group">
      <h3 id={headingId}>{heading}</h3>
      {followUps.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <ul className="planning-list">
          {followUps.map((followUp) => {
            const due = getFollowUpDuePresentation(followUp, now);
            return (
              <li key={followUp.id}>
                <Link
                  className="planning-list-link"
                  href={`/klienter/${clientId}/uppfoljningar/${followUp.id}`}
                >
                  <span className="planning-list-heading">
                    <strong>{followUp.title}</strong>
                    <span>{followUpStatusLabels[followUp.status]}</span>
                  </span>
                  <span>
                    <strong>
                      {followUp.status === "PLANNED"
                        ? `${due.label}:`
                        : "Datum:"}
                    </strong>{" "}
                    {due.value}
                  </span>
                  <span>
                    <strong>Ansvarig:</strong> {followUp.responsibleUser.name}
                  </span>
                  {followUp.responsibilityNeedsReassignment ? (
                    <span className="attention-text">
                      Ansvarig saknar aktuell klientbehörighet – välj en ny
                      ansvarig.
                    </span>
                  ) : null}
                  {followUp.goal ? (
                    <span>
                      <strong>Mål:</strong> {followUp.goal.title}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function FollowUpsPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  const result = await loadClientWorkspace(clientId);
  let followUps;
  try {
    followUps = await listFollowUps({ clientId });
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  const now = new Date();
  const planned = followUps.filter((followUp) => followUp.status === "PLANNED");
  const overdue = planned.filter(
    (followUp) => getFollowUpDuePresentation(followUp, now).state === "OVERDUE",
  );
  const upcoming = planned.filter(
    (followUp) => getFollowUpDuePresentation(followUp, now).state !== "OVERDUE",
  );

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="follow-ups"
        />
        <section
          aria-labelledby="follow-ups-heading"
          className="client-section"
        >
          <div className="planning-page-heading">
            <div>
              <h2 id="follow-ups-heading">Uppföljningar</h2>
              <p>Konkreta saker som behöver följas upp för klienten.</p>
            </div>
            {result.client.status !== "ARCHIVED" ? (
              <Link
                className="primary-button button-link"
                href={`/klienter/${clientId}/uppfoljningar/ny`}
              >
                Ny uppföljning
              </Link>
            ) : null}
          </div>
          {result.client.status === "ARCHIVED" ? (
            <p className="planning-read-only">
              Klienten är arkiverad. Uppföljningarna visas skrivskyddat.
            </p>
          ) : null}
          <FollowUpGroup
            clientId={clientId}
            emptyText="Det finns inga försenade uppföljningar."
            followUps={overdue}
            heading="Försenade"
            headingId="overdue-follow-ups-heading"
            now={now}
          />
          <FollowUpGroup
            clientId={clientId}
            emptyText="Det finns inga planerade uppföljningar."
            followUps={upcoming}
            heading="Planerade"
            headingId="planned-follow-ups-heading"
            now={now}
          />
          <FollowUpGroup
            clientId={clientId}
            emptyText="Det finns inga slutförda uppföljningar."
            followUps={followUps.filter(
              (followUp) => followUp.status === "COMPLETED",
            )}
            heading="Slutförda"
            headingId="completed-follow-ups-heading"
            now={now}
          />
          <FollowUpGroup
            clientId={clientId}
            emptyText="Det finns inga avbrutna uppföljningar."
            followUps={followUps.filter(
              (followUp) => followUp.status === "CANCELLED",
            )}
            heading="Avbrutna"
            headingId="cancelled-follow-ups-heading"
            now={now}
          />
        </section>
      </div>
    </ApplicationShell>
  );
}
