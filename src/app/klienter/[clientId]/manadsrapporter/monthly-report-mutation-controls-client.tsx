"use client";

import { useActionState } from "react";

import {
  beginMonthlyReportReplacementAction,
  signMonthlyReportDraftAction,
  type MonthlyReportMutationState,
} from "./actions";

export function SignMonthlyReportControl({
  monthlyReportId,
  version,
  operationId,
}: Readonly<{
  monthlyReportId: string;
  version: number;
  operationId: string;
}>) {
  const initialState: MonthlyReportMutationState = {
    status: "IDLE",
    operationId,
  };
  const [state, action, pending] = useActionState(
    signMonthlyReportDraftAction,
    initialState,
  );
  return (
    <form action={action}>
      <input name="operationId" type="hidden" value={state.operationId} />
      <input name="monthlyReportId" type="hidden" value={monthlyReportId} />
      <input name="expectedVersion" type="hidden" value={version} />
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Signerar…" : "Signera månadsrapport"}
      </button>
      <p
        aria-live="polite"
        className="form-error"
        role={state.message ? "alert" : undefined}
      >
        {state.message}
      </p>
    </form>
  );
}

export function BeginMonthlyReportReplacementControl({
  monthlyReportId,
}: Readonly<{ monthlyReportId: string }>) {
  const initialState: MonthlyReportMutationState = {
    status: "IDLE",
    operationId: "",
  };
  const [state, action, pending] = useActionState(
    beginMonthlyReportReplacementAction,
    initialState,
  );
  return (
    <form action={action} className="journal-correction-action">
      <input name="monthlyReportId" type="hidden" value={monthlyReportId} />
      <button className="secondary-button" disabled={pending} type="submit">
        {pending ? "Skapar…" : "Skapa ersättningsrapport"}
      </button>
      <p
        aria-live="polite"
        className="form-error"
        role={state.message ? "alert" : undefined}
      >
        {state.message}
      </p>
    </form>
  );
}
