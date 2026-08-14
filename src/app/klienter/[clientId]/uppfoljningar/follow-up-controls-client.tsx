"use client";

import { useActionState, type FormEvent } from "react";

import type { EligibleResponsibleUser } from "@/modules/planning/planning";

import {
  changeFollowUpStatusAction,
  reassignFollowUpAction,
  type FollowUpMutationActionState,
} from "./actions";

export function ReassignFollowUpControl({
  eligibleUsers,
  followUpId,
  operationId,
  responsibleUserId,
  version,
}: Readonly<{
  eligibleUsers: readonly EligibleResponsibleUser[];
  followUpId: string;
  operationId: string;
  responsibleUserId: string;
  version: number;
}>) {
  const initialState: FollowUpMutationActionState = {
    status: "IDLE",
    operationId,
  };
  const [state, action, pending] = useActionState(
    reassignFollowUpAction,
    initialState,
  );
  const currentIsEligible = eligibleUsers.some(
    (user) => user.id === responsibleUserId,
  );
  return (
    <form action={action} className="planning-reassignment-form">
      <input name="followUpId" type="hidden" value={followUpId} />
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="operationId" type="hidden" value={state.operationId} />
      <div className="form-field">
        <label htmlFor="new-responsible-user">Byt ansvarig</label>
        <select
          defaultValue={currentIsEligible ? responsibleUserId : ""}
          id="new-responsible-user"
          name="responsibleUserId"
          required
        >
          {!currentIsEligible ? (
            <option value="">Välj ny ansvarig</option>
          ) : null}
          {eligibleUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} – {user.professionalTitle}
            </option>
          ))}
        </select>
      </div>
      <button className="secondary-button" disabled={pending} type="submit">
        {pending ? "Sparar…" : "Spara ansvarig"}
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

export function FollowUpLifecycleControl({
  followUpId,
  operationId,
  transition,
  version,
}: Readonly<{
  followUpId: string;
  operationId: string;
  transition: "complete" | "cancel";
  version: number;
}>) {
  const initialState: FollowUpMutationActionState = {
    status: "IDLE",
    operationId,
  };
  const [state, action, pending] = useActionState(
    changeFollowUpStatusAction,
    initialState,
  );
  function confirmTransition(event: FormEvent<HTMLFormElement>) {
    const message =
      transition === "complete"
        ? "Vill du markera uppföljningen som slutförd? Den bevaras som historik och kan inte redigeras eller återupptas. Ingen journalanteckning skapas automatiskt."
        : "Vill du avbryta uppföljningen? Den bevaras som historik och kan inte redigeras eller återupptas.";
    if (!window.confirm(message)) event.preventDefault();
  }
  return (
    <form action={action} onSubmit={confirmTransition}>
      <input name="followUpId" type="hidden" value={followUpId} />
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="operationId" type="hidden" value={state.operationId} />
      <input name="transition" type="hidden" value={transition} />
      <button
        className={`secondary-button${transition === "cancel" ? " danger-button" : ""}`}
        disabled={pending}
        type="submit"
      >
        {pending
          ? "Sparar…"
          : transition === "complete"
            ? "Markera som slutförd"
            : "Avbryt uppföljning"}
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
