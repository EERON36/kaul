"use client";

import { useActionState, type FormEvent } from "react";

import { archiveClientAction, type ClientActionState } from "../actions";

export function ClientArchive({
  clientId,
  operationId,
  hasActiveAssignments,
  isInactive,
}: Readonly<{
  clientId: string;
  operationId: string;
  hasActiveAssignments: boolean;
  isInactive: boolean;
}>) {
  const initialState: ClientActionState = { status: "IDLE", operationId };
  const [state, action, pending] = useActionState(
    archiveClientAction,
    initialState,
  );
  const blocked = hasActiveAssignments || !isInactive;

  function confirmArchive(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        "Vill du arkivera klienten? Klienten tas bort från aktiva listor men historiken bevaras. Åtgärden kan inte ångras i Kaul.",
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <section
      aria-labelledby="archive-client-heading"
      className="client-section archive-section"
    >
      <h2 id="archive-client-heading">Arkivera klient</h2>
      <p>
        Klienten tas bort från aktiva listor. Historik och avslutade
        tilldelningar bevaras.
      </p>
      {hasActiveAssignments ? (
        <p className="form-error">
          Klienten kan inte arkiveras förrän alla aktiva tilldelningar har
          avslutats.
        </p>
      ) : !isInactive ? (
        <p className="form-error">
          Klienten måste vara inaktiv innan den kan arkiveras.
        </p>
      ) : null}
      <form action={action} onSubmit={confirmArchive}>
        <input name="operationId" type="hidden" value={state.operationId} />
        <input name="clientId" type="hidden" value={clientId} />
        <button
          className="secondary-button danger-button"
          disabled={pending || blocked}
          type="submit"
        >
          {pending ? "Arkiverar…" : "Arkivera klient"}
        </button>
        <p
          aria-live="polite"
          className={state.status === "ERROR" ? "form-error" : "form-status"}
        >
          {state.message}
        </p>
      </form>
    </section>
  );
}
