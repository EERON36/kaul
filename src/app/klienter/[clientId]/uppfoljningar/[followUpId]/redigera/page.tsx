import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { getFollowUp, listGoals } from "@/modules/planning/planning";

import { formatPlanningDateInput } from "@/app/planning-presentation";
import { ClientWorkspaceHeader } from "../../../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../../client-workspace-data";
import type { FollowUpFormActionState } from "../../actions";
import { FollowUpForm } from "../../follow-up-form-client";

export const dynamic = "force-dynamic";

export default async function EditFollowUpPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string; followUpId: string }> }>) {
  const { clientId, followUpId } = await params;
  const result = await loadClientWorkspace(clientId);
  if (result.client.status === "ARCHIVED") notFound();
  let followUp;
  let goals;
  try {
    [followUp, goals] = await Promise.all([
      getFollowUp({ followUpId }),
      listGoals({ clientId }),
    ]);
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  if (followUp.clientId !== result.client.id || followUp.status !== "PLANNED")
    notFound();
  const selectableGoals = goals.filter(
    (goal) =>
      goal.status === "ACTIVE" ||
      goal.status === "PAUSED" ||
      goal.id === followUp.goalId,
  );
  const initialState: FollowUpFormActionState = {
    status: "IDLE",
    values: {
      title: followUp.title,
      description: followUp.description ?? "",
      dueDate: formatPlanningDateInput(followUp.dueDate),
      dueTime: followUp.dueTime ?? "",
      responsibleUserId: followUp.responsibleUser.id,
      goalId: followUp.goalId ?? "",
    },
    followUpId: followUp.id,
    version: followUp.version,
    responsibleName: `${followUp.responsibleUser.name} – ${followUp.responsibleUser.professionalTitle}`,
  };
  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="follow-ups"
        />
        <section
          aria-labelledby="edit-follow-up-heading"
          className="client-section"
        >
          <p className="eyebrow">Uppföljning</p>
          <h2 id="edit-follow-up-heading">Redigera uppföljning</h2>
          <FollowUpForm
            clientId={clientId}
            goals={selectableGoals}
            initialState={initialState}
          />
        </section>
      </div>
    </ApplicationShell>
  );
}
