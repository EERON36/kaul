"use client";

import { useActionState, useEffect, useRef, type FormEvent } from "react";

import {
  JOURNAL_CONTENT_MAX_LENGTH,
  JOURNAL_ENTRY_TYPE_LABELS,
  JOURNAL_ENTRY_TYPE_VALUES,
} from "@/modules/journal/journal-entry-type";
import type { AvailableJournalGoal } from "@/modules/journal/journal";

import { goalStatusLabels } from "@/app/planning-presentation";
import { useNavigationGuard } from "@/components/navigation-guard";

import {
  discardJournalDraftAction,
  saveJournalDraftAction,
  type JournalDraftActionState,
  type JournalMutationActionState,
} from "./actions";
import {
  areJournalFormValuesEqual,
  type JournalFormValues,
} from "./journal-form-values";
import {
  JOURNAL_SECTION_FIELDS,
  serializeJournalSections,
  type JournalSectionValues,
} from "./journal-sections";

function readCurrentJournalFormValues(
  form: HTMLFormElement,
): JournalFormValues {
  const formData = new FormData(form);
  const sections = Object.fromEntries(
    JOURNAL_SECTION_FIELDS.map(({ key }) => [
      key,
      String(formData.get(key) ?? ""),
    ]),
  ) as JournalSectionValues;
  return {
    entryType: String(formData.get("entryType") ?? ""),
    eventDate: String(formData.get("eventDate") ?? ""),
    eventTime: String(formData.get("eventTime") ?? ""),
    content: String(formData.get("content") ?? ""),
    goalIds: formData.getAll("goalIds").map(String),
    ...sections,
  };
}

function getSectionValue(
  values: JournalFormValues,
  key: (typeof JOURNAL_SECTION_FIELDS)[number]["key"],
): string {
  if (values[key] !== undefined) return values[key];
  return key === "otherContent" ? values.content : "";
}

export function JournalDraftForm({
  clientId,
  initialState,
  goals,
}: Readonly<{
  clientId: string;
  initialState: JournalDraftActionState;
  goals: readonly AvailableJournalGoal[];
}>) {
  const [state, saveAction, saving] = useActionState(
    saveJournalDraftAction,
    initialState,
  );
  const discardInitialState: JournalMutationActionState = { status: "IDLE" };
  const [discardState, discardAction, discarding] = useActionState(
    discardJournalDraftAction,
    discardInitialState,
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

  function confirmDiscard(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Vill du kasta utkastet? Dina ändringar försvinner.")) {
      event.preventDefault();
    }
  }

  const fieldErrors = state.fieldErrors ?? {};
  const disabled = saving || discarding;
  const statusIsInformational = saving || state.status === "SUCCESS";

  return (
    <div className="journal-editor">
      <form
        action={saveAction}
        aria-busy={saving}
        onChange={(event) => {
          const dirty = !areJournalFormValuesEqual(
            savedValuesRef.current,
            readCurrentJournalFormValues(event.currentTarget),
          );
          dirtyRef.current = dirty;
          setNavigationBlocked(dirty);
        }}
        onSubmit={(event) => {
          const formData = new FormData(event.currentTarget);
          const sections = Object.fromEntries(
            JOURNAL_SECTION_FIELDS.map(({ key }) => [
              key,
              String(formData.get(key) ?? ""),
            ]),
          ) as JournalSectionValues;
          const content = event.currentTarget.elements.namedItem("content");
          if (content instanceof HTMLInputElement) {
            content.value = serializeJournalSections(sections);
          }
        }}
      >
        <input name="clientId" type="hidden" value={clientId} />
        <input name="content" type="hidden" value={state.values.content} />

        <fieldset
          aria-describedby={
            fieldErrors.content ? "journal-content-error" : undefined
          }
          className="journal-section-fields"
        >
          <legend>Anteckning</legend>
          <p className="form-help">
            Fyll i de delar som är relevanta. Du behöver inte fylla i alla
            delar.
          </p>
          {JOURNAL_SECTION_FIELDS.map(({ key, label, id }) => (
            <div className="form-field" key={key}>
              <label htmlFor={id}>{label}</label>
              <textarea
                defaultValue={getSectionValue(state.values, key)}
                disabled={disabled}
                id={id}
                maxLength={JOURNAL_CONTENT_MAX_LENGTH}
                name={key}
                rows={8}
              />
            </div>
          ))}
          {fieldErrors.content ? (
            <p className="field-error" id="journal-content-error">
              {fieldErrors.content}
            </p>
          ) : null}
        </fieldset>

        {/* Kept as a server-action compatibility field until structured Journal
            columns are available at the domain boundary. */}
        <input
          name="journalEntryId"
          type="hidden"
          value={state.journalEntryId ?? ""}
        />
        <input
          name="expectedVersion"
          type="hidden"
          value={state.version ?? ""}
        />

        <div className="form-field">
          <label htmlFor="journal-entry-type">Typ av anteckning</label>
          <select
            aria-describedby={
              fieldErrors.entryType ? "journal-entry-type-error" : undefined
            }
            aria-invalid={fieldErrors.entryType ? true : undefined}
            defaultValue={state.values.entryType}
            disabled={disabled}
            id="journal-entry-type"
            name="entryType"
            required
          >
            {JOURNAL_ENTRY_TYPE_VALUES.map((entryType) => (
              <option key={entryType} value={entryType}>
                {JOURNAL_ENTRY_TYPE_LABELS[entryType]}
              </option>
            ))}
          </select>
          {fieldErrors.entryType ? (
            <p className="field-error" id="journal-entry-type-error">
              {fieldErrors.entryType}
            </p>
          ) : null}
        </div>

        <fieldset className="journal-event-fields">
          <legend>Händelsetid</legend>
          <p className="form-help" id="journal-event-time-help">
            Ange när händelsen inträffade.
          </p>
          <div className="form-field">
            <label htmlFor="journal-event-date">Datum för händelsen</label>
            <input
              aria-describedby={
                fieldErrors.eventDate
                  ? "journal-event-time-help journal-event-date-error"
                  : "journal-event-time-help"
              }
              aria-invalid={fieldErrors.eventDate ? true : undefined}
              defaultValue={state.values.eventDate}
              disabled={disabled}
              id="journal-event-date"
              name="eventDate"
              required
              type="date"
            />
            {fieldErrors.eventDate ? (
              <p className="field-error" id="journal-event-date-error">
                {fieldErrors.eventDate}
              </p>
            ) : null}
          </div>
          <div className="form-field">
            <label htmlFor="journal-event-time">Tid för händelsen</label>
            <input
              aria-describedby={
                fieldErrors.eventTime
                  ? "journal-event-time-help journal-event-time-error"
                  : "journal-event-time-help"
              }
              aria-invalid={fieldErrors.eventTime ? true : undefined}
              defaultValue={state.values.eventTime}
              disabled={disabled}
              id="journal-event-time"
              name="eventTime"
              required
              type="time"
            />
            {fieldErrors.eventTime ? (
              <p className="field-error" id="journal-event-time-error">
                {fieldErrors.eventTime}
              </p>
            ) : null}
          </div>
        </fieldset>

        <fieldset className="journal-goal-fields">
          <legend>Mål (valfritt)</legend>
          <p className="form-help" id="journal-goals-help">
            Välj de mål som ger sammanhang till anteckningen. Du kan lämna alla
            omarkerade.
          </p>
          {goals.length === 0 ? (
            <p>Det finns inga mål att välja för klienten.</p>
          ) : (
            <div className="journal-goal-options">
              {goals.map((goal) => (
                <label key={goal.id}>
                  <input
                    aria-describedby={
                      fieldErrors.goalIds
                        ? "journal-goals-help journal-goals-error"
                        : "journal-goals-help"
                    }
                    defaultChecked={state.values.goalIds.includes(goal.id)}
                    disabled={disabled}
                    key={`${goal.id}-${state.version ?? "new"}-${state.status}`}
                    name="goalIds"
                    type="checkbox"
                    value={goal.id}
                  />
                  <span>
                    <strong>{goal.title}</strong>
                    <span>{goalStatusLabels[goal.status]}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {fieldErrors.goalIds ? (
            <p className="field-error" id="journal-goals-error">
              {fieldErrors.goalIds}
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
            {saving ? "Sparar…" : "Spara utkast"}
          </button>
          <button
            className="primary-button"
            disabled={disabled}
            name="submitIntent"
            type="submit"
            value="review"
          >
            {saving ? "Sparar…" : "Granska inför signering"}
          </button>
        </div>

        <div
          aria-live="polite"
          className={statusIsInformational ? "form-status" : "form-error"}
          role={statusIsInformational ? "status" : "alert"}
        >
          {saving
            ? "Utkastet sparas. Vänta tills det är klart innan du fortsätter redigera."
            : state.message}
          {!saving &&
          (state.status === "STALE" || state.status === "PARTIAL") ? (
            <span className="status-action">
              <a href={`/klienter/${clientId}/anteckningar/utkast`}>
                Ladda om utkastet
              </a>
            </span>
          ) : null}
        </div>
      </form>

      <form
        action={discardAction}
        className="journal-discard-form"
        onSubmit={confirmDiscard}
      >
        <input name="clientId" type="hidden" value={clientId} />
        <input
          name="journalEntryId"
          type="hidden"
          value={state.journalEntryId ?? ""}
        />
        <input
          name="expectedVersion"
          type="hidden"
          value={state.version ?? ""}
        />
        <button
          className="secondary-button danger-button"
          disabled={disabled}
          type="submit"
        >
          {discarding ? "Kastar…" : "Kasta utkast"}
        </button>
        <p
          aria-live="polite"
          className="form-error"
          role={discardState.message ? "alert" : undefined}
        >
          {discardState.message}
          {discardState.status === "CONFLICT" ? (
            <span className="status-action">
              <a href={`/klienter/${clientId}/anteckningar/utkast`}>
                Ladda om utkastet
              </a>
            </span>
          ) : null}
        </p>
      </form>
    </div>
  );
}
