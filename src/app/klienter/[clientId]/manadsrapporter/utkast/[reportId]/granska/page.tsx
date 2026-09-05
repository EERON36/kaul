import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { generateAuditOperationId } from "@/modules/audit/audit";
import {
  getMonthlyReport,
  MonthlyReportError,
} from "@/modules/reports/monthly-reports";

import { ClientWorkspaceHeader } from "../../../../client-workspace";
import { loadClientWorkspace } from "../../../../client-workspace-data";
import { SignMonthlyReportControl } from "../../../monthly-report-mutation-controls-client";
import { MonthlyReportSectionsPresentation } from "../../../report-sections-presentation";
import {
  formatMonthlyReportDate,
  formatMonthlyReportMonth,
} from "../../../report-presentation";

export const dynamic = "force-dynamic";

export default async function MonthlyReportReviewPage({
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

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="monthly-reports"
        />
        <article
          aria-labelledby="monthly-report-review-heading"
          className="journal-record"
        >
          <p className="eyebrow">Granska inför signering</p>
          <h2 id="monthly-report-review-heading">
            Månadsrapport{" "}
            {formatMonthlyReportMonth(
              report.calendarYear,
              report.calendarMonth,
            )}
          </h2>
          <dl className="journal-metadata">
            <div>
              <dt>Referens</dt>
              <dd>{report.reference}</dd>
            </div>
            <div>
              <dt>Senast ändrad</dt>
              <dd>
                <time dateTime={report.updatedAt.toISOString()}>
                  {formatMonthlyReportDate(report.updatedAt)}
                </time>
              </dd>
            </div>
          </dl>
          <section
            aria-labelledby="monthly-report-review-content-heading"
            className="journal-content-section"
          >
            <h3 id="monthly-report-review-content-heading">Rapportinnehåll</h3>
            <MonthlyReportSectionsPresentation sections={report} />
          </section>
          <p className="journal-signing-warning">
            När du signerar kan rapporten inte längre ändras. Fel rättas genom
            en separat ersättningsrapport.
          </p>
          <div className="journal-review-actions">
            <SignMonthlyReportControl
              monthlyReportId={report.id}
              operationId={generateAuditOperationId()}
              version={report.version}
            />
            <Link
              className="secondary-button button-link"
              href={`/klienter/${clientId}/manadsrapporter/utkast/${report.id}`}
            >
              Tillbaka till utkastet
            </Link>
          </div>
        </article>
      </div>
    </ApplicationShell>
  );
}
