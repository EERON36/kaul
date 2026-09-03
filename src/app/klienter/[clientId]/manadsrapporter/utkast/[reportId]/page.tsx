import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { NavigationGuardProvider } from "@/components/navigation-guard";
import {
  getMonthlyReport,
  MonthlyReportError,
} from "@/modules/reports/monthly-reports";

import { ClientWorkspaceHeader } from "../../../client-workspace";
import { loadClientWorkspace } from "../../../client-workspace-data";
import { MonthlyReportDraftForm } from "../../monthly-report-draft-form-client";
import type { MonthlyReportActionState } from "../../actions";
import { formatMonthlyReportMonth } from "../../report-presentation";

export const dynamic = "force-dynamic";

export default async function MonthlyReportDraftPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string; reportId: string }> }>) {
  const { clientId, reportId } = await params;
  const result = await loadClientWorkspace(clientId);
  let report;
  try {
    report = await getMonthlyReport({ monthlyReportId: reportId });
  } catch (error) {
    if (
      error instanceof MonthlyReportError &&
      error.code === "TARGET_UNAVAILABLE"
    )
      notFound();
    throw error;
  }
  if (report.clientId !== clientId || report.status !== "DRAFT") notFound();

  const initialState: MonthlyReportActionState = {
    status: "IDLE",
    values: {
      healthContent: report.healthContent ?? "",
      educationOccupationContent: report.educationOccupationContent ?? "",
      emotionsBehaviorContent: report.emotionsBehaviorContent ?? "",
      socialRelationsContent: report.socialRelationsContent ?? "",
      dailyLivingIndependenceContent:
        report.dailyLivingIndependenceContent ?? "",
      otherContent: report.otherContent ?? "",
    },
    monthlyReportId: report.id,
    version: report.version,
  };

  return (
    <NavigationGuardProvider confirmationMessage="Du har osparade ändringar i månadsrapporten. Vill du lämna sidan?">
      <ApplicationShell currentPath="/klienter" user={result.user}>
        <div className="page-content">
          <ClientWorkspaceHeader
            client={result.client}
            currentSection="monthly-reports"
          />
          <section
            aria-labelledby="monthly-report-draft-heading"
            className="client-section"
          >
            <p className="eyebrow">Utkast</p>
            <h2 id="monthly-report-draft-heading">
              Månadsrapport{" "}
              {formatMonthlyReportMonth(
                report.calendarYear,
                report.calendarMonth,
              )}
            </h2>
            {report.replacesReportId ? (
              <p className="journal-immutability-notice">
                Detta är en ersättningsrapport. Den tidigare signerade rapporten
                ändras inte.
              </p>
            ) : null}
            <MonthlyReportDraftForm
              clientId={clientId}
              initialState={initialState}
            />
          </section>
        </div>
      </ApplicationShell>
    </NavigationGuardProvider>
  );
}
