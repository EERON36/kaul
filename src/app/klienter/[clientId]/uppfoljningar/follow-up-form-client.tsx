"use client";

import Link from "next/link";
import { useActionState } from "react";

import type {
  EligibleResponsibleUser,
  GoalRecord,
} from "@/modules/planning/planning";

import { saveFollowUpAction, type FollowUpFormActionState } from "./actions";

export function FollowUpForm({
  clientId,
  eligibleUsers,
  goals,
  initialState,
}: Readonly<{
  clientId: string;
  eligibleUsers: readonly EligibleResponsibleUser[];
  goals: readonly GoalRecord[];
  initialState: FollowUpFormActionState;
}>) {
  const [state, action, pending] = useActionState(
    saveFollowUpAction,
    initialState,
  );
  const errors = state.fieldErrors ?? {};
  const cancelHref = state.followUpId
    ? `/klienter/${clientId}/uppfoljningar/${state.followUpId}`
    : `/klienter/${clientId}/uppfoljningar`;

  return (
    <form action={action} className="planning-form">
      <input name="clientId" type="hidden" value={clientId} />
      <input name="followUpId" type="hidden" value={state.followUpId ?? ""} />
      <input name="expectedVersion" type="hidden" value={state.version ?? ""} />
      <div className="form-field">
        <label htmlFor="follow-up-title">Rubrik</label>
        <input
          aria-describedby={errors.title ? "follow-up-title-error" : undefined}
          aria-invalid={errors.title ? true : undefined}
          defaultValue={state.values.title}
          id="follow-up-title"
          maxLength={200}
          name="title"
          required
        />
        {errors.title ? (
          <p className="field-error" id="follow-up-title-error">
            {errors.title}
          </p>
        ) : null}
      </div>
      <div className="form-field">
        <label htmlFor="follow-up-description">Beskrivning (valfritt)</label>
        <textarea
          aria-describedby={
            errors.description ? "follow-up-description-error" : undefined
          }
          aria-invalid={errors.description ? true : undefined}
          defaultValue={state.values.description}
          id="follow-up-description"
          maxLength={20_000}
          name="description"
          rows={8}
        />
        {errors.description ? (
          <p className="field-error" id="follow-up-description-error">
            {errors.description}
          </p>
        ) : null}
      </div>
      <div className="form-field">
        <label htmlFor="follow-up-date">Datum för uppföljning</label>
        <input
          aria-describedby={errors.dueDate ? "follow-up-date-error" : undefined}
          aria-invalid={errors.dueDate ? true : undefined}
          defaultValue={state.values.dueDate}
          id="follow-up-date"
          name="dueDate"
          required
          type="date"
        />
        {errors.dueDate ? (
          <p className="field-error" id="follow-up-date-error">
            {errors.dueDate}
          </p>
        ) : null}
      </div>
      <div className="form-field">
        <label htmlFor="follow-up-time">Tid för uppföljning (valfritt)</label>
        <input
          aria-describedby={errors.dueTime ? "follow-up-time-error" : undefined}
          aria-invalid={errors.dueTime ? true : undefined}
          defaultValue={state.values.dueTime}
          id="follow-up-time"
          name="dueTime"
          type="time"
        />
        {errors.dueTime ? (
          <p className="field-error" id="follow-up-time-error">
            {errors.dueTime}
          </p>
        ) : null}
      </div>
      {state.followUpId ? (
        <div className="form-field">
          <input
            name="responsibleUserId"
            type="hidden"
            value={state.values.responsibleUserId}
          />
          <dl className="readonly-field-metadata">
            <div>
              <dt>Ansvarig medarbetare</dt>
              <dd>{state.responsibleName}</dd>
            </div>
          </dl>
          <p className="form-help">
            Ansvarig ändras separat nedan för att förändringen ska bevaras i
            historiken.
          </p>
        </div>
      ) : (
        <div className="form-field">
          <label htmlFor="follow-up-responsible">Ansvarig medarbetare</label>
          <select
            aria-describedby={
              errors.responsibleUserId
                ? "follow-up-responsible-error"
                : undefined
            }
            aria-invalid={errors.responsibleUserId ? true : undefined}
            defaultValue={state.values.responsibleUserId}
            id="follow-up-responsible"
            name="responsibleUserId"
            required
          >
            <option value="">Välj ansvarig</option>
            {eligibleUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} – {user.professionalTitle}
              </option>
            ))}
          </select>
          {errors.responsibleUserId ? (
            <p className="field-error" id="follow-up-responsible-error">
              {errors.responsibleUserId}
            </p>
          ) : null}
        </div>
      )}
      <div className="form-field">
        <label htmlFor="follow-up-goal">Kopplat mål (valfritt)</label>
        <select
          aria-describedby={errors.goalId ? "follow-up-goal-error" : undefined}
          aria-invalid={errors.goalId ? true : undefined}
          defaultValue={state.values.goalId}
          id="follow-up-goal"
          name="goalId"
        >
          <option value="">Inget kopplat mål</option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title}
            </option>
          ))}
        </select>
        {errors.goalId ? (
          <p className="field-error" id="follow-up-goal-error">
            {errors.goalId}
          </p>
        ) : null}
      </div>
      <div className="form-actions planning-form-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending
            ? "Sparar…"
            : state.followUpId
              ? "Spara ändringar"
              : "Skapa uppföljning"}
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
            <a href={cancelHref}>Ladda om uppföljningen</a>
          </span>
        ) : null}
      </p>
    </form>
  );
}
