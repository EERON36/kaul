import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { generateAuditOperationId } from "@/modules/audit/audit";
import {
  getFollowUp,
  listEligibleResponsibleUsers,
} from "@/modules/planning/planning";

import { ClientWorkspaceHeader } from "../../../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../../client-workspace-data";
import { ReassignFollowUpControl } from "../../follow-up-controls-client";

export const dynamic = "force-dynamic";

export default async function ReassignFollowUpPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string; followUpId: string }> }>) {
  const { clientId, followUpId } = await params;
  const result = await loadClientWorkspace(clientId);
  if (result.client.status === "ARCHIVED") notFound();

  let followUp;
  let eligibleUsers;
  try {
    [followUp, eligibleUsers] = await Promise.all([
      getFollowUp({ followUpId }),
      listEligibleResponsibleUsers({ clientId }),
    ]);
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  if (followUp.clientId !== result.client.id || followUp.status !== "PLANNED")
    notFound();

  const detailHref = `/klienter/${clientId}/uppfoljningar/${followUp.id}`;

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="follow-ups"
        />
        <section
          aria-labelledby="reassign-follow-up-heading"
          className="client-section"
        >
          <p className="eyebrow">Uppföljning</p>
          <h2 id="reassign-follow-up-heading">Byt ansvarig</h2>
          <p className="form-help">
            Det här sparar endast ansvarig medarbetare. Uppföljningens innehåll
            ändras inte. Bytet bevaras i uppföljningens historik.
          </p>
          {followUp.responsibilityNeedsReassignment ? (
            <p className="planning-attention">
              Den nuvarande ansvariga personen saknar aktuell behörighet. Välj
              en ny ansvarig.
            </p>
          ) : null}
          <ReassignFollowUpControl
            eligibleUsers={eligibleUsers}
            followUpId={followUp.id}
            operationId={generateAuditOperationId()}
            responsibleUserId={followUp.responsibleUser.id}
            version={followUp.version}
          />
          <p>
            <Link className="secondary-button button-link" href={detailHref}>
              Avbryt
            </Link>
          </p>
        </section>
      </div>
    </ApplicationShell>
  );
}
