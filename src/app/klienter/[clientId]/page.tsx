import { notFound, redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { generateAuditOperationId } from "@/modules/audit/audit";
import { AuthenticationGuardError } from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";
import {
  ClientAccessError,
  requireClientAccess,
} from "@/modules/clients/client-access";
import { getClientCategoryLabel } from "@/modules/clients/client-category";
import { getClientStatusLabel } from "@/modules/clients/client-presentation";
import { listAssignableStaff } from "@/modules/clients/clients";

import { AssignmentManagement } from "./assignment-management-client";
import { ClientEdit } from "./client-edit-client";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  let result;
  try {
    result = await requireClientAccess(clientId);
  } catch (error) {
    if (error instanceof ClientAccessError) notFound();
    if (error instanceof AuthenticationGuardError) {
      const destination = getApplicationErrorRedirect(error.code);
      if (destination) redirect(destination);
    }
    throw error;
  }

  const staff =
    result.user.role === "ADMINISTRATOR" ? await listAssignableStaff() : [];

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <p className="eyebrow">Klient</p>
        <h1>
          {result.client.firstName} {result.client.lastName}
        </h1>
        <dl className="client-details">
          <div>
            <dt>Personreferens</dt>
            <dd className="client-identifier">
              {result.client.personIdentifier}
            </dd>
          </div>
          <div>
            <dt>Kategori</dt>
            <dd>{getClientCategoryLabel(result.client.category)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{getClientStatusLabel(result.client.status)}</dd>
          </div>
        </dl>

        {result.user.role === "ADMINISTRATOR" ? (
          <ClientEdit
            client={result.client}
            operationId={generateAuditOperationId()}
          />
        ) : null}

        {result.user.role === "ADMINISTRATOR" ? (
          <AssignmentManagement
            assignments={result.client.assignments.map((assignment) => ({
              ...assignment,
              operationId: generateAuditOperationId(),
            }))}
            clientId={result.client.id}
            createOperationId={generateAuditOperationId()}
            staff={staff}
          />
        ) : (
          <section
            aria-labelledby="assignment-heading"
            className="client-section"
          >
            <h2 id="assignment-heading">Ansvarig personal</h2>
            <ul className="assignment-list">
              {result.client.assignments
                .filter((assignment) => !assignment.endedAt)
                .map((assignment) => (
                  <li key={assignment.id}>
                    <div>
                      <h3>{assignment.staffUser.name}</h3>
                      <p>{assignment.staffUser.professionalTitle}</p>
                      <p>
                        {assignment.responsibility === "PRIMARY"
                          ? "Primär"
                          : "Sekundär"}
                      </p>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </ApplicationShell>
  );
}
