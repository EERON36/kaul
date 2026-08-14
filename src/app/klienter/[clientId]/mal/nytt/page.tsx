import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { formatStockholmCalendarDate } from "@/lib/stockholm-time";

import { ClientWorkspaceHeader } from "../../client-workspace";
import { loadClientWorkspace } from "../../client-workspace-data";
import type { GoalFormActionState } from "../actions";
import { GoalForm } from "../goal-form-client";

export const dynamic = "force-dynamic";

export default async function NewGoalPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  const result = await loadClientWorkspace(clientId);
  if (result.client.status === "ARCHIVED") notFound();
  const initialState: GoalFormActionState = {
    status: "IDLE",
    values: {
      title: "",
      description: "",
      startDate: formatStockholmCalendarDate(new Date()),
      targetDate: "",
    },
  };

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader client={result.client} currentSection="goals" />
        <section aria-labelledby="new-goal-heading" className="client-section">
          <p className="eyebrow">Mål</p>
          <h2 id="new-goal-heading">Nytt mål</h2>
          <GoalForm clientId={clientId} initialState={initialState} />
        </section>
      </div>
    </ApplicationShell>
  );
}
