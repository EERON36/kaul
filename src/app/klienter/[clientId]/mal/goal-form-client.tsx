"use client";

import Link from "next/link";
import { useActionState } from "react";

import { saveGoalAction, type GoalFormActionState } from "./actions";

export function GoalForm({
  clientId,
  initialState,
}: Readonly<{ clientId: string; initialState: GoalFormActionState }>) {
  const [state, action, pending] = useActionState(saveGoalAction, initialState);
  const errors = state.fieldErrors ?? {};
  const cancelHref = state.goalId
    ? `/klienter/${clientId}/mal/${state.goalId}`
    : `/klienter/${clientId}/mal`;

  return (
    <form action={action} className="planning-form">
      <input name="clientId" type="hidden" value={clientId} />
      <input name="goalId" type="hidden" value={state.goalId ?? ""} />
      <input name="expectedVersion" type="hidden" value={state.version ?? ""} />

      <div className="form-field">
        <label htmlFor="goal-title">Rubrik</label>
        <input
          aria-describedby={errors.title ? "goal-title-error" : undefined}
          aria-invalid={errors.title ? true : undefined}
          defaultValue={state.values.title}
          id="goal-title"
          maxLength={200}
          name="title"
          required
        />
        {errors.title ? (
          <p className="field-error" id="goal-title-error">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="goal-description">Beskrivning (valfritt)</label>
        <textarea
          aria-describedby={
            errors.description ? "goal-description-error" : undefined
          }
          aria-invalid={errors.description ? true : undefined}
          defaultValue={state.values.description}
          id="goal-description"
          maxLength={20_000}
          name="description"
          rows={8}
        />
        {errors.description ? (
          <p className="field-error" id="goal-description-error">
            {errors.description}
          </p>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="goal-start-date">Startdatum</label>
        <input
          aria-describedby={
            errors.startDate ? "goal-start-date-error" : undefined
          }
          aria-invalid={errors.startDate ? true : undefined}
          defaultValue={state.values.startDate}
          id="goal-start-date"
          name="startDate"
          required
          type="date"
        />
        {errors.startDate ? (
          <p className="field-error" id="goal-start-date-error">
            {errors.startDate}
          </p>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="goal-target-date">
          Måldatum eller datum för uppföljning (valfritt)
        </label>
        <input
          aria-describedby={
            errors.targetDate ? "goal-target-date-error" : undefined
          }
          aria-invalid={errors.targetDate ? true : undefined}
          defaultValue={state.values.targetDate}
          id="goal-target-date"
          name="targetDate"
          type="date"
        />
        {errors.targetDate ? (
          <p className="field-error" id="goal-target-date-error">
            {errors.targetDate}
          </p>
        ) : null}
      </div>

      <div className="form-actions planning-form-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Sparar…" : state.goalId ? "Spara ändringar" : "Skapa mål"}
        </button>
        <Link className="secondary-button button-link" href={cancelHref}>
          Avbryt
        </Link>
      </div>
      <p
        aria-live="polite"
        className="form-error"
        role={state.message ? "alert" : undefined}
      >
        {state.message}
        {state.status === "CONFLICT" ? (
          <span className="status-action">
            <a href={cancelHref}>Ladda om målet</a>
          </span>
        ) : null}
      </p>
    </form>
  );
}
