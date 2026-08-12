import Link from "next/link";
import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { AuthenticationGuardError } from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";
import { getClientCategoryLabel } from "@/modules/clients/client-category";
import { getAssignmentResponsibilityLabel } from "@/modules/clients/client-presentation";
import { listAssignedClientsForHome } from "@/modules/clients/clients";

export const dynamic = "force-dynamic";

export default async function Home() {
  let result;

  try {
    result = await listAssignedClientsForHome();
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
