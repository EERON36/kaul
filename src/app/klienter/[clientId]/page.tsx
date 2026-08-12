import Link from "next/link";
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
import { ClientArchive } from "./client-archive-client";
import { ClientEdit } from "./client-edit-client";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ arkiverad?: string | string[] }>;
}>) {
  const { clientId } = await params;
  const query = await searchParams;
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

  const isArchived = result.client.status === "ARCHIVED";
  const staff =
    result.user.role === "ADMINISTRATOR" && !isArchived
      ? await listAssignableStaff()
      : [];
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("sv-SE", {
      dateStyle: "long",
      timeZone: "Europe/Stockholm",
    }).format(date);

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <p className="eyebrow">Klient</p>
        {isArchived ? (
          <p>
            <Link href="/klienter/arkiverade">Till Arkiverade klienter</Link>
          </p>
        ) : null}
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
          {result.client.archivedAt ? (
            <div>
              <dt>Arkiverad</dt>
              <dd>
                <time dateTime={result.client.archivedAt.toISOString()}>
                  {formatDate(result.client.archivedAt)}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>

        {isArchived && query.arkiverad === "klar" ? (
          <p aria-live="polite" className="form-status" role="status">
            Klienten har arkiverats.
          </p>
        ) : null}

        {result.user.role === "ADMINISTRATOR" && !isArchived ? (
          <ClientEdit
            client={result.client}
            operationId={generateAuditOperationId()}
          />
        ) : null}

        {result.user.role === "ADMINISTRATOR" && !isArchived ? (
          <AssignmentManagement
            assignments={result.client.assignments.map((assignment) => ({
              ...assignment,
              operationId: generateAuditOperationId(),
            }))}
            clientId={result.client.id}
            createOperationId={generateAuditOperationId()}
            staff={staff}
          />
        ) : isArchived ? (
          <section
            aria-labelledby="assignment-history-heading"
            className="client-section"
          >
            <h2 id="assignment-history-heading">Historiska tilldelningar</h2>
            {result.client.assignments.length === 0 ? (
              <p>Klienten har inga historiska tilldelningar.</p>
            ) : (
              <ul className="assignment-list">
                {result.client.assignments.map((assignment) => (
                  <li key={assignment.id}>
                    <div>
                      <h3>{assignment.staffUser.name}</h3>
                      <p>{assignment.staffUser.professionalTitle}</p>
                      <p>
                        <strong>Ansvar:</strong>{" "}
                        {assignment.responsibility === "PRIMARY"
                          ? "Primär"
                          : "Sekundär"}
                      </p>
                      <p>
                        <strong>Startad:</strong>{" "}
                        <time dateTime={assignment.startedAt.toISOString()}>
                          {formatDate(assignment.startedAt)}
                        </time>
                      </p>
                      <p>
                        <strong>Avslutad:</strong>{" "}
                        {assignment.endedAt ? (
                          <time dateTime={assignment.endedAt.toISOString()}>
                            {formatDate(assignment.endedAt)}
                          </time>
                        ) : (
                          "Saknas"
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
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

        {result.user.role === "ADMINISTRATOR" && !isArchived ? (
          <ClientArchive
            clientId={result.client.id}
            hasActiveAssignments={result.client.assignments.some(
              (assignment) => assignment.endedAt === null,
            )}
            isInactive={result.client.status === "INACTIVE"}
            operationId={generateAuditOperationId()}
          />
        ) : null}
      </div>
    </ApplicationShell>
  );
}
