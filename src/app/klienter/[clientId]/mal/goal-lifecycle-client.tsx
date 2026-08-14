"use client";

import { useActionState, type FormEvent } from "react";

import {
  changeGoalStatusAction,
  type GoalMutationActionState,
} from "./actions";

type GoalTransition = "pause" | "resume" | "complete" | "archive";

const labels: Record<GoalTransition, string> = {
  pause: "Pausa",
  resume: "Återuppta",
  complete: "Markera som slutfört",
  archive: "Arkivera",
};

export function GoalLifecycleControl({
  goalId,
  operationId,
  transition,
  version,
}: Readonly<{
  goalId: string;
  operationId: string;
  transition: GoalTransition;
  version: number;
}>) {
  const initialState: GoalMutationActionState = { status: "IDLE", operationId };
  const [state, action, pending] = useActionState(
    changeGoalStatusAction,
    initialState,
  );

  function confirmTerminalAction(event: FormEvent<HTMLFormElement>) {
    const message =
      transition === "complete"
        ? "Vill du markera målet som slutfört? Målet blir historik och kan inte redigeras eller återupptas."
        : transition === "archive"
          ? "Vill du arkivera målet? Målet bevaras som historik och kan inte redigeras eller återupptas."
          : null;
    if (message && !window.confirm(message)) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={confirmTerminalAction}>
      <input name="goalId" type="hidden" value={goalId} />
      <input name="expectedVersion" type="hidden" value={version} />
      <input name="operationId" type="hidden" value={state.operationId} />
      <input name="transition" type="hidden" value={transition} />
      <button
        className={`secondary-button${transition === "archive" ? " danger-button" : ""}`}
        disabled={pending}
        type="submit"
      >
        {pending ? "Sparar…" : labels[transition]}
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
