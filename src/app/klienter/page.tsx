import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { generateAuditOperationId } from "@/modules/audit/audit";
import { AuthenticationGuardError } from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";
import { listClients } from "@/modules/clients/clients";

import { ClientList } from "./client-list-client";
import { parseClientCategoryView } from "./client-category-view";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ kategori?: string | string[] }>;
}>) {
  const query = await searchParams;
  const categoryView = parseClientCategoryView(query.kategori);
  let result;
  try {
    result = await listClients();
  } catch (error) {
    if (error instanceof AuthenticationGuardError) {
      const destination = getApplicationErrorRedirect(error.code);
      if (destination) redirect(destination);
    }
    throw error;
  }

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <p className="eyebrow">{result.user.organisationName}</p>
        <h1>Klienter</h1>
        <p className="introductory-text">
          Öppna en klient för att se grunduppgifter och ansvarig personal.
        </p>
        <ClientList
          activeCategoryView={categoryView}
          canCreate={result.user.role === "ADMINISTRATOR"}
          clients={result.clients}
          key={categoryView}
          operationId={generateAuditOperationId()}
          showPrimaryStaff={result.user.role === "ADMINISTRATOR"}
        />
      </div>
    </ApplicationShell>
  );
}
