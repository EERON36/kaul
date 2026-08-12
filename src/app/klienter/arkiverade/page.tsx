import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { AuthenticationGuardError } from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";
import {
  getClientCategoryLabel,
  groupClientsByCategory,
} from "@/modules/clients/client-category";
import { listArchivedClients } from "@/modules/clients/clients";

export const dynamic = "force-dynamic";

export default async function ArchivedClientsPage() {
  let result;
  try {
    result = await listArchivedClients();
  } catch (error) {
    if (error instanceof AuthenticationGuardError) {
      const destination = getApplicationErrorRedirect(error.code);
      if (destination) redirect(destination);
      if (error.code === "FORBIDDEN") notFound();
    }
    throw error;
  }

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <p className="eyebrow">Klientarkiv</p>
        <h1>Arkiverade klienter</h1>
        <p className="introductory-text">
          Historiska klientuppgifter och avslutade tilldelningar visas här.
        </p>
        <p>
          <Link href="/klienter">Till klienter</Link>
        </p>
        <section
          aria-labelledby="archived-client-list"
          className="client-section"
        >
          <h2 id="archived-client-list">Klientlista</h2>
          {result.clients.length === 0 ? (
            <p>Det finns inga arkiverade klienter.</p>
          ) : (
            <div className="client-category-groups">
              {groupClientsByCategory(result.clients).map((group) => (
                <section
                  aria-labelledby={`archived-client-category-${group.key}`}
                  className="client-category-group"
                  key={group.key}
                >
                  <h3 id={`archived-client-category-${group.key}`}>
                    {group.label}
                  </h3>
                  <ul className="client-list">
                    {group.clients.map((client) => (
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
                          <span>Status: Arkiverad</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </ApplicationShell>
  );
}
