import { getClientCategoryLabel } from "@/modules/clients/client-category";
import { getClientStatusLabel } from "@/modules/clients/client-presentation";

import { NavigationGuardLink as Link } from "@/components/navigation-guard";

type ClientWorkspaceClient = Readonly<{
  id: string;
  firstName: string;
  lastName: string;
  personIdentifier: string;
  category: string;
  status: "INACTIVE" | "ACTIVE" | "ARCHIVED";
  archivedAt: Date | null;
}>;

export function ClientWorkspaceHeader({
  client,
  currentSection,
}: Readonly<{
  client: ClientWorkspaceClient;
  currentSection: "overview" | "journal" | "goals" | "follow-ups";
}>) {
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("sv-SE", {
      dateStyle: "long",
      timeZone: "Europe/Stockholm",
    }).format(date);

  return (
    <>
      <p className="eyebrow">Klient</p>
      {client.status === "ARCHIVED" ? (
        <p>
          <Link href="/klienter/arkiverade">Till Arkiverade klienter</Link>
        </p>
      ) : null}
      <h1>
        {client.firstName} {client.lastName}
      </h1>
      <dl className="client-details">
        <div>
          <dt>Personreferens</dt>
          <dd className="client-identifier">{client.personIdentifier}</dd>
        </div>
        <div>
          <dt>Kategori</dt>
          <dd>{getClientCategoryLabel(client.category)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{getClientStatusLabel(client.status)}</dd>
        </div>
        {client.archivedAt ? (
          <div>
            <dt>Arkiverad</dt>
            <dd>
              <time dateTime={client.archivedAt.toISOString()}>
                {formatDate(client.archivedAt)}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
      <nav aria-label="Klientarbetsyta" className="client-workspace-navigation">
        <Link
          aria-current={currentSection === "overview" ? "page" : undefined}
          href={`/klienter/${client.id}`}
        >
          Översikt
        </Link>
        <Link
          aria-current={currentSection === "journal" ? "page" : undefined}
          href={`/klienter/${client.id}/anteckningar`}
        >
          Anteckningar
        </Link>
        <Link
          aria-current={currentSection === "goals" ? "page" : undefined}
          href={`/klienter/${client.id}/mal`}
        >
          Mål
        </Link>
        <Link
          aria-current={currentSection === "follow-ups" ? "page" : undefined}
          href={`/klienter/${client.id}/uppfoljningar`}
        >
          Uppföljningar
        </Link>
      </nav>
    </>
  );
}
