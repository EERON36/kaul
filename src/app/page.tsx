import Link from "next/link";
import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { AuthenticationGuardError } from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";
import { getClientCategoryLabel } from "@/modules/clients/client-category";
import { getAssignmentResponsibilityLabel } from "@/modules/clients/client-presentation";
import { listAssignedClientsForHome } from "@/modules/clients/clients";
import {
  listOwnFollowUpsForHome,
  type OwnFollowUpHomeItem,
} from "@/modules/planning/planning";

import {
  followUpDueStateLabels,
  formatPlanningDate,
} from "./planning-presentation";

export const dynamic = "force-dynamic";

function HomeFollowUpGroup({
  heading,
  headingId,
  items,
}: Readonly<{
  heading: string;
  headingId: string;
  items: readonly OwnFollowUpHomeItem[];
}>) {
  if (items.length === 0) return null;
  return (
    <div aria-labelledby={headingId} className="home-follow-up-group">
      <h3 id={headingId}>{heading}</h3>
      <ul className="planning-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              className="planning-list-link"
              href={`/klienter/${item.clientId}/uppfoljningar/${item.id}`}
            >
              <strong>{item.title}</strong>
              <span>
                <strong>Klient:</strong> {item.clientFirstName}{" "}
                {item.clientLastName}
              </span>
              <span>
                <strong>{followUpDueStateLabels[item.dueState]}:</strong>{" "}
                {formatPlanningDate(item.dueDate)}
                {item.dueTime ? ` kl. ${item.dueTime}` : ""}
              </span>
              {item.goal ? (
                <span>
                  <strong>Mål:</strong> {item.goal.title}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function Home() {
  let result;
  let followUps;

  try {
    [result, followUps] = await Promise.all([
      listAssignedClientsForHome(),
      listOwnFollowUpsForHome(),
    ]);
  } catch (error) {
    if (error instanceof AuthenticationGuardError) {
      const destination = getApplicationErrorRedirect(error.code);

      if (destination) {
        redirect(destination);
      }
    }

    throw error;
  }

  return (
    <ApplicationShell currentPath="/" user={result.user}>
      <div className="page-content">
        <p className="eyebrow">{result.user.organisationName}</p>
        <h1>Översikt</h1>
        <p className="introductory-text">
          {result.user.role === "STAFF_MEMBER"
            ? "Här ser du de klienter du arbetar med just nu."
            : "Du är inloggad i Kaul."}
        </p>

        <section
          aria-labelledby="own-follow-ups-heading"
          className="client-section"
        >
          <h2 id="own-follow-ups-heading">Att göra</h2>
          {followUps.length === 0 ? (
            <p>Du har inga uppföljningar som behöver din uppmärksamhet nu.</p>
          ) : (
            <>
              <HomeFollowUpGroup
                heading="Försenade"
                headingId="home-overdue-heading"
                items={followUps.filter((item) => item.dueState === "OVERDUE")}
              />
              <HomeFollowUpGroup
                heading="Idag"
                headingId="home-today-heading"
                items={followUps.filter(
                  (item) => item.dueState === "DUE_TODAY",
                )}
              />
              <HomeFollowUpGroup
                heading="Kommande"
                headingId="home-upcoming-heading"
                items={followUps.filter((item) => item.dueState === "UPCOMING")}
              />
            </>
          )}
        </section>

        {result.user.role === "STAFF_MEMBER" ? (
          <section
            aria-labelledby="assigned-clients-heading"
            className="client-section"
          >
            <h2 id="assigned-clients-heading">Mina klienter</h2>
            {result.clients.length === 0 ? (
              <p>
                Inga klienter är tilldelade till dig just nu. Kontakta en
                administratör om du tror att detta är fel.
              </p>
            ) : (
              <ul className="client-list">
                {result.clients.map((client) => (
                  <li key={client.id}>
                    <Link
                      className="client-list-link"
                      href={`/klienter/${client.id}`}
                    >
                      <span className="client-list-name">
                        {client.firstName} {client.lastName}
                      </span>
                      <span className="client-identifier">
                        {client.personIdentifier}
                      </span>
                      <span>{getClientCategoryLabel(client.category)}</span>
                      <span>
                        <strong>Ansvar:</strong>{" "}
                        {getAssignmentResponsibilityLabel(
                          client.responsibility,
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </ApplicationShell>
  );
}
