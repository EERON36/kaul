import { redirect } from "next/navigation";
import Link from "next/link";

import { ApplicationShell } from "@/components/application-shell";
import { generateAuditOperationId } from "@/modules/audit/audit";
import { AuthenticationGuardError } from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";
import { listClients } from "@/modules/clients/clients";

import { ClientList } from "./client-list-client";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
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
        {result.user.role === "ADMINISTRATOR" ? (
          <p>
            <Link href="/klienter/arkiverade">Visa arkiverade klienter</Link>
          </p>
        ) : null}
        <ClientList
          canCreate={result.user.role === "ADMINISTRATOR"}
          clients={result.clients}
          operationId={generateAuditOperationId()}
        />
      </div>
    </ApplicationShell>
  );
}
