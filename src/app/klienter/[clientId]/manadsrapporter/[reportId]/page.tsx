import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import {
  getMonthlyReport,
  MonthlyReportError,
} from "@/modules/reports/monthly-reports";

import { ClientWorkspaceHeader } from "../../client-workspace";
import { loadClientWorkspace } from "../../client-workspace-data";
import { BeginMonthlyReportReplacementControl } from "../monthly-report-mutation-controls-client";
import { MonthlyReportSectionsPresentation } from "../report-sections-presentation";
import {
  formatMonthlyReportDate,
  formatMonthlyReportMonth,
  getMonthlyReportSignerSnapshot,
} from "../report-presentation";

export const dynamic = "force-dynamic";

export default async function MonthlyReportDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ clientId: string; reportId: string }>;
  searchParams: Promise<{ signerad?: string | string[] }>;
}>) {
  const { clientId, reportId } = await params;
  const query = await searchParams;
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
  if (report.clientId !== clientId || report.status !== "SIGNED") notFound();

  return (
    <ApplicationShell currentPath="/klienter" user={result.user}>
      <div className="page-content">
        <ClientWorkspaceHeader
          client={result.client}
          currentSection="monthly-reports"
        />
        {query.signerad === "klar" ? (
          <p aria-live="polite" className="form-status" role="status">
            Månadsrapporten har signerats.
          </p>
        ) : null}
        <article
          aria-labelledby="monthly-report-heading"
          className="journal-record"
        >
          <p className="eyebrow">Signerad månadsrapport</p>
          <h2 id="monthly-report-heading">
            Månadsrapport{" "}
            {formatMonthlyReportMonth(
              report.calendarYear,
              report.calendarMonth,
            )}
          </h2>
          <p className="journal-reference">{report.reference}</p>
          <dl className="journal-metadata">
            <div>
              <dt>Status</dt>
              <dd>Signerad</dd>
            </div>
            <div>
              <dt>Signerad den</dt>
              <dd>
                {report.signedAt ? (
                  <time dateTime={report.signedAt.toISOString()}>
                    {formatMonthlyReportDate(report.signedAt)}
                  </time>
                ) : (
                  "Uppgift saknas"
                )}
              </dd>
            </div>
            <div>
              <dt>Signerad av</dt>
              <dd>{report.signerName ?? "Uppgift saknas"}</dd>
            </div>
            {getMonthlyReportSignerSnapshot(
              report.signerProfessionalTitle,
              report.signerRole,
            ).map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <section
            aria-labelledby="monthly-report-content-heading"
            className="journal-content-section"
          >
            <h3 id="monthly-report-content-heading">Rapportinnehåll</h3>
            <MonthlyReportSectionsPresentation sections={report} />
          </section>
          <p className="journal-immutability-notice">
            Rapporten är signerad och kan inte ändras.
          </p>
          {report.replacesReport ? (
            <p>
              Detta är en ersättningsrapport för{" "}
              <Link
                href={`/klienter/${clientId}/manadsrapporter/${report.replacesReport.id}`}
              >
                {report.replacesReport.reference}
              </Link>
              . Den tidigare rapporten finns kvar oförändrad.
            </p>
          ) : null}
          {report.replacement?.status === "SIGNED" ? (
            <p>
              Rapporten har ersatts av{" "}
              <Link
                href={`/klienter/${clientId}/manadsrapporter/${report.replacement.id}`}
              >
                {report.replacement.reference}
              </Link>
              .
            </p>
          ) : null}
          {result.client.status !== "ARCHIVED" && !report.replacement ? (
            <BeginMonthlyReportReplacementControl monthlyReportId={report.id} />
          ) : null}
        </article>
      </div>
    </ApplicationShell>
  );
}
