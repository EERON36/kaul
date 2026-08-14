import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { formatStockholmCalendarDate } from "@/lib/stockholm-time";
import {
  listEligibleResponsibleUsers,
  listGoals,
} from "@/modules/planning/planning";

import { ClientWorkspaceHeader } from "../../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../client-workspace-data";
import type { FollowUpFormActionState } from "../actions";
import { FollowUpForm } from "../follow-up-form-client";

export const dynamic = "force-dynamic";

export default async function NewFollowUpPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  const result = await loadClientWorkspace(clientId);
  if (result.client.status === "ARCHIVED") notFound();
  let eligibleUsers;
  let goals;
  try {
    [eligibleUsers, goals] = await Promise.all([
      listEligibleResponsibleUsers({ clientId }),
      listGoals({ clientId }),
    ]);
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  const initialState: FollowUpFormActionState = {
    status: "IDLE",
    values: {
      title: "",
      description: "",
      dueDate: formatStockholmCalendarDate(new Date()),
      dueTime: "",
      responsibleUserId: "",
      goalId: "",
    },
  };
  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="follow-ups"
        />
        <section
          aria-labelledby="new-follow-up-heading"
          className="client-section"
        >
          <p className="eyebrow">Uppföljning</p>
          <h2 id="new-follow-up-heading">Ny uppföljning</h2>
          <FollowUpForm
            clientId={clientId}
            eligibleUsers={eligibleUsers}
            goals={goals.filter(
              (goal) => goal.status === "ACTIVE" || goal.status === "PAUSED",
            )}
            initialState={initialState}
          />
        </section>
      </div>
    </ApplicationShell>
  );
}
