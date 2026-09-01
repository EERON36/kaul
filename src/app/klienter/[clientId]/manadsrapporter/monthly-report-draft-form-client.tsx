"use client";

import { useActionState, useEffect, useRef, type FormEvent } from "react";

import {
  STRUCTURED_CONTENT_MAX_LENGTH,
  STRUCTURED_SECTION_DEFINITIONS,
  type StructuredSectionValues,
} from "@/lib/structured-sections";
import { useNavigationGuard } from "@/components/navigation-guard";

import {
  saveMonthlyReportDraftAction,
  type MonthlyReportActionState,
} from "./actions";

function readCurrentValues(form: HTMLFormElement): StructuredSectionValues {
  const formData = new FormData(form);
  return Object.fromEntries(
    STRUCTURED_SECTION_DEFINITIONS.map(({ key }) => [
      key,
      String(formData.get(key) ?? ""),
    ]),
  ) as StructuredSectionValues;
}

function areValuesEqual(
  first: StructuredSectionValues,
  second: StructuredSectionValues,
): boolean {
  return STRUCTURED_SECTION_DEFINITIONS.every(
    ({ key }) => first[key] === second[key],
  );
}

export function MonthlyReportDraftForm({
  clientId,
  initialState,
}: Readonly<{
  clientId: string;
  initialState: MonthlyReportActionState;
}>) {
  const [state, action, pending] = useActionState(
    saveMonthlyReportDraftAction,
    initialState,
  );
  const setNavigationBlocked = useNavigationGuard();
  const savedValuesRef = useRef(initialState.values);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (state.status !== "SUCCESS") return;
    savedValuesRef.current = state.values;
    dirtyRef.current = false;
    setNavigationBlocked(false);
  }, [setNavigationBlocked, state]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  const disabled = pending;
  const errors = state.fieldErrors ?? {};

  return (
    <form
      action={action}
      aria-busy={pending}
      onChange={(event) => {
        const dirty = !areValuesEqual(
          savedValuesRef.current,
          readCurrentValues(event.currentTarget),
        );
        dirtyRef.current = dirty;
        setNavigationBlocked(dirty);
      }}
    >
      <input
        name="monthlyReportId"
        type="hidden"
        value={state.monthlyReportId}
      />
      <input name="expectedVersion" type="hidden" value={state.version} />
      <fieldset
        aria-describedby={
          errors.otherContent ? "monthly-report-content-error" : undefined
        }
        className="journal-section-fields"
      >
        <legend>Rapportinnehåll</legend>
        <p className="form-help">
          Fyll i de delar som är relevanta. Ingen enskild del är obligatorisk.
        </p>
        {STRUCTURED_SECTION_DEFINITIONS.map(({ key, label }) => {
          const id = `monthly-report-${key}`;
          return (
            <div className="form-field" key={key}>
              <label htmlFor={id}>{label}</label>
              <textarea
                defaultValue={state.values[key]}
                disabled={disabled}
                id={id}
                maxLength={STRUCTURED_CONTENT_MAX_LENGTH}
                name={key}
                rows={8}
              />
            </div>
          );
        })}
        {errors.otherContent ? (
          <p className="field-error" id="monthly-report-content-error">
            {errors.otherContent}
          </p>
        ) : null}
      </fieldset>
      <div className="form-actions journal-form-actions">
        <button
          className="secondary-button"
          disabled={disabled}
          name="submitIntent"
          type="submit"
          value="save"
        >
          {pending ? "Sparar…" : "Spara"}
        </button>
        <button
          className="primary-button"
          disabled={disabled}
          name="submitIntent"
          type="submit"
          value="review"
        >
          {pending ? "Sparar…" : "Granska inför signering"}
        </button>
      </div>
      <p
        aria-live="polite"
        className={state.status === "SUCCESS" ? "form-status" : "form-error"}
        role={state.status === "SUCCESS" ? "status" : "alert"}
      >
        {state.message}
        {state.status === "CONFLICT" ? (
          <span className="status-action">
            <a
              href={`/klienter/${clientId}/manadsrapporter/utkast/${state.monthlyReportId}`}
            >
              Ladda om rapporten
            </a>
          </span>
        ) : null}
      </p>
    </form>
  );
}

export function confirmMonthlyReportDiscard(event: FormEvent<HTMLFormElement>) {
  if (
    !window.confirm("Vill du lämna rapporten? Osparade ändringar försvinner.")
  ) {
    event.preventDefault();
  }
}
