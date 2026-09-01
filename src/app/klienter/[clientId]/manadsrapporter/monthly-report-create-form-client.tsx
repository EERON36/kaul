"use client";

import { useActionState } from "react";

import {
  createMonthlyReportDraftAction,
  type MonthlyReportMutationState,
} from "./actions";

export function MonthlyReportCreateForm({
  clientId,
  year,
  month,
  months,
}: Readonly<{
  clientId: string;
  year: number;
  month: number;
  months: readonly (readonly [number, string])[];
}>) {
  const initialState: MonthlyReportMutationState = {
    status: "IDLE",
    operationId: "",
  };
  const [state, action, pending] = useActionState(
    createMonthlyReportDraftAction,
    initialState,
  );
  return (
    <form action={action} className="monthly-report-create-form">
      <input name="clientId" type="hidden" value={clientId} />
      <div className="form-field">
        <label htmlFor="monthly-report-calendar-month">Månad</label>
        <select
          defaultValue={String(month)}
          id="monthly-report-calendar-month"
          name="calendarMonth"
          required
        >
          {months.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="monthly-report-calendar-year">År</label>
        <input
          defaultValue={year}
          id="monthly-report-calendar-year"
          max={9999}
          min={1900}
          name="calendarYear"
          required
          type="number"
        />
      </div>
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Öppnar…" : "Öppna månadsrapport"}
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
