import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { getStockholmCalendarMonth } from "@/lib/stockholm-time";
import { loadClientWorkspace } from "../client-workspace-data";
import { ClientWorkspaceHeader } from "../client-workspace";
import {
  listMonthlyReports,
  MonthlyReportError,
} from "@/modules/reports/monthly-reports";

import {
  formatMonthlyReportDate,
  formatMonthlyReportMonth,
} from "./report-presentation";
import { MonthlyReportCreateForm } from "./monthly-report-create-form-client";

export const dynamic = "force-dynamic";

const monthChoices = [
  [1, "Januari"],
  [2, "Februari"],
  [3, "Mars"],
  [4, "April"],
  [5, "Maj"],
  [6, "Juni"],
  [7, "Juli"],
  [8, "Augusti"],
  [9, "September"],
  [10, "Oktober"],
  [11, "November"],
  [12, "December"],
] as const;

function reportStatusLabel(status: string): string {
  return status === "SIGNED" ? "Signerad" : "Utkast";
}

export default async function MonthlyReportsPage({
  params,
}: Readonly<{ params: Promise<{ clientId: string }> }>) {
  const { clientId } = await params;
  const result = await loadClientWorkspace(clientId);
  let reports;
  try {
    reports = await listMonthlyReports({ clientId });
  } catch (error) {
    if (
      error instanceof MonthlyReportError &&
      error.code === "TARGET_UNAVAILABLE"
    ) {
      notFound();
    }
    throw error;
  }
  const currentMonth = getStockholmCalendarMonth(new Date());

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="monthly-reports"
        />
        <section
          aria-labelledby="monthly-reports-heading"
          className="client-section"
        >
          <h2 id="monthly-reports-heading">Månadsrapporter</h2>
          <p>Skapa, granska och signera en rapport för varje kalendermånad.</p>
          {result.client.status === "ARCHIVED" ? (
            <p>Klienten är arkiverad. Månadsrapporter visas skrivskyddat.</p>
          ) : (
            <MonthlyReportCreateForm
              clientId={clientId}
              month={currentMonth.month}
              months={monthChoices}
              year={currentMonth.year}
            />
          )}
        </section>
        <section
          aria-labelledby="monthly-report-history-heading"
          className="client-section"
        >
          <h2 id="monthly-report-history-heading">Historik</h2>
          {reports.length === 0 ? (
            <p>Inga månadsrapporter har registrerats ännu.</p>
          ) : (
            <ol className="journal-history-list">
              {reports.map((report) => (
                <li key={report.id}>
                  <Link
                    className="journal-history-link"
                    href={
                      report.status === "DRAFT"
                        ? `/klienter/${clientId}/manadsrapporter/utkast/${report.id}`
                        : `/klienter/${clientId}/manadsrapporter/${report.id}`
                    }
                  >
                    <span className="journal-history-heading">
                      <strong>
                        {formatMonthlyReportMonth(
                          report.calendarYear,
                          report.calendarMonth,
                        )}
                      </strong>
                      <span>{reportStatusLabel(report.status)}</span>
                    </span>
                    <span>
                      <strong>Referens:</strong> {report.reference}
                    </span>
                    <span>
                      <strong>Version:</strong> {report.revision}
                    </span>
                    <span>
                      <strong>Senast ändrad:</strong>{" "}
                      <time dateTime={report.updatedAt.toISOString()}>
                        {formatMonthlyReportDate(report.updatedAt)}
                      </time>
                    </span>
                    {report.replacesReport ? (
                      <span>Ersätter {report.replacesReport.reference}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </ApplicationShell>
  );
}
