import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { getGoal } from "@/modules/planning/planning";

import { formatPlanningDateInput } from "@/app/planning-presentation";
import { ClientWorkspaceHeader } from "../../../client-workspace";
import {
  handleClientWorkspacePageError,
  loadClientWorkspace,
} from "../../../client-workspace-data";
import type { GoalFormActionState } from "../../actions";
import { GoalForm } from "../../goal-form-client";

export const dynamic = "force-dynamic";

export default async function EditGoalPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string; goalId: string }> }>) {
  const { clientId, goalId } = await params;
  const result = await loadClientWorkspace(clientId);
  let goal;
  try {
    goal = await getGoal({ goalId });
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
  if (
    goal.clientId !== result.client.id ||
    result.client.status === "ARCHIVED" ||
    (goal.status !== "ACTIVE" && goal.status !== "PAUSED")
  )
    notFound();
  const initialState: GoalFormActionState = {
    status: "IDLE",
    values: {
      title: goal.title,
      description: goal.description ?? "",
      startDate: formatPlanningDateInput(goal.startDate),
      targetDate: goal.targetDate
        ? formatPlanningDateInput(goal.targetDate)
        : "",
    },
    goalId: goal.id,
    version: goal.version,
  };

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader client={result.client} currentSection="goals" />
        <section aria-labelledby="edit-goal-heading" className="client-section">
          <p className="eyebrow">Mål</p>
          <h2 id="edit-goal-heading">Redigera mål</h2>
          <GoalForm clientId={clientId} initialState={initialState} />
        </section>
      </div>
    </ApplicationShell>
  );
}
