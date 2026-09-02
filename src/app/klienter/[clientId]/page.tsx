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
import { getAssignmentResponsibilityLabel } from "@/modules/clients/client-presentation";
import {
  getClientEditingDetails,
  getClientPersonalIdentityNumberForEditing,
  getClientSensitiveSummary,
  listAssignableStaff,
} from "@/modules/clients/clients";

import { AssignmentManagement } from "./assignment-management-client";
import { ClientArchive } from "./client-archive-client";
import { ClientEdit } from "./client-edit-client";
import { ClientWorkspaceHeader } from "./client-workspace";

export const dynamic = "force-dynamic";

type ResponsibilityAssignment = Readonly<{
  id: string;
  responsibility: "PRIMARY" | "SECONDARY";
  endedAt: Date | null;
  staffUser: Readonly<{
    name: string;
    professionalTitle: string;
  }>;
}>;

function ClientResponsibilitySummary({
  assignments,
  clientStatus,
}: Readonly<{
  assignments: readonly ResponsibilityAssignment[];
  clientStatus: "INACTIVE" | "ACTIVE" | "ARCHIVED";
}>) {
  const activeAssignments = assignments.filter(
    (assignment) => assignment.endedAt === null,
  );
  const primary = activeAssignments.find(
    (assignment) => assignment.responsibility === "PRIMARY",
  );
  const secondary = activeAssignments.filter(
    (assignment) => assignment.responsibility === "SECONDARY",
  );
  const isInactive = clientStatus === "INACTIVE";

  return (
    <section
      aria-labelledby="responsibility-summary-heading"
      className="client-section"
    >
      <h2 id="responsibility-summary-heading">
        {isInactive ? "Ansvar och åtkomst" : "Aktuellt ansvar"}
      </h2>
      {isInactive ? (
        <div className="client-inactive-guidance">
          <p>
            Klienten är inte aktiv. Lägg till en primär tilldelning för att
            aktivera klientarbetet.
          </p>
          {secondary.length > 0 ? (
            <p>
              De sekundära tilldelningarna är inte avslutade, men ger inte
              personalen åtkomst så länge klienten saknar en aktiv primär
              tilldelning.
            </p>
          ) : null}
        </div>
      ) : null}
      <dl className="responsibility-summary">
        <div>
          <dt>{getAssignmentResponsibilityLabel("PRIMARY")}</dt>
          <dd>
            {primary ? (
              <>
                <strong>{primary.staffUser.name}</strong>
                <span>{primary.staffUser.professionalTitle}</span>
              </>
            ) : (
              "Ingen aktiv primär ansvarig"
            )}
          </dd>
        </div>
        <div>
          <dt>{getAssignmentResponsibilityLabel("SECONDARY")}</dt>
          <dd>
            {secondary.length === 0 ? (
              "Ingen aktiv sekundär ansvarig"
            ) : (
              <ul className="responsibility-name-list">
                {secondary.map((assignment) => (
                  <li key={assignment.id}>
                    <strong>{assignment.staffUser.name}</strong>
                    <span>{assignment.staffUser.professionalTitle}</span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default async function ClientPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{
    arkiverad?: string | string[];
    redigera?: string | string[];
  }>;
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
  const editRequested = query.redigera === "ja";
  const [sensitiveSummary, staff, editingDetails, personalIdentityNumber] =
    await Promise.all([
      getClientSensitiveSummary(clientId),
      result.user.role === "ADMINISTRATOR" && !isArchived
        ? listAssignableStaff()
        : Promise.resolve([]),
      result.user.role === "ADMINISTRATOR" && !isArchived && editRequested
        ? getClientEditingDetails(clientId)
        : Promise.resolve(null),
      result.user.role === "ADMINISTRATOR" && !isArchived && editRequested
        ? getClientPersonalIdentityNumberForEditing(clientId)
        : Promise.resolve(null),
    ]);
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("sv-SE", {
      dateStyle: "long",
      timeZone: "Europe/Stockholm",
    }).format(date);

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="overview"
        />

        {isArchived && query.arkiverad === "klar" ? (
          <p aria-live="polite" className="form-status" role="status">
            Klienten har arkiverats.
          </p>
        ) : null}

        {result.client.status === "ACTIVE" ? (
          <section
            aria-labelledby="client-documentation-heading"
            className="client-section client-overview-action"
          >
            <h2 id="client-documentation-heading">Dokumentera arbetet</h2>
            <Link
              className="primary-button button-link"
              href={`/klienter/${result.client.id}/anteckningar/utkast`}
            >
              Ny anteckning
            </Link>
          </section>
        ) : null}

        <section
          aria-labelledby="client-information-heading"
          className="client-section"
        >
          <h2 id="client-information-heading">Klientuppgifter</h2>
          <dl className="client-details">
            <div>
              <dt>Personnummer</dt>
              <dd>
                {sensitiveSummary.hasPersonalIdentityNumber
                  ? "Registrerat (visas endast vid redigering)"
                  : "Inte registrerat"}
              </dd>
            </div>
            <div>
              <dt>Placerande enhet</dt>
              <dd>{result.client.placingUnit ?? "Inte angiven"}</dd>
            </div>
            <div>
              <dt>Lagrum</dt>
              <dd>{result.client.legalBasis ?? "Inte angivet"}</dd>
            </div>
            <div>
              <dt>Ansvarig socialsekreterare</dt>
              <dd>
                {result.client.responsibleSocialWorkerName ?? "Inte angiven"}
              </dd>
            </div>
            <div>
              <dt>Telefon till ansvarig socialsekreterare</dt>
              <dd>
                {result.client.responsibleSocialWorkerPhone ?? "Inte angiven"}
              </dd>
            </div>
            <div>
              <dt>E-post till ansvarig socialsekreterare</dt>
              <dd>
                {result.client.responsibleSocialWorkerEmail ?? "Inte angiven"}
              </dd>
            </div>
          </dl>
        </section>

        {!isArchived ? (
          <ClientResponsibilitySummary
            assignments={result.client.assignments}
            clientStatus={result.client.status}
          />
        ) : null}

        {result.user.role === "ADMINISTRATOR" && !isArchived ? (
          editRequested && editingDetails ? (
            <ClientEdit
              client={{ ...editingDetails, personalIdentityNumber }}
              operationId={generateAuditOperationId()}
              startEditing
            />
          ) : (
            <p>
              <Link href={`/klienter/${clientId}?redigera=ja`}>
                Redigera klientuppgifter
              </Link>
            </p>
          )
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
        ) : null}

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
