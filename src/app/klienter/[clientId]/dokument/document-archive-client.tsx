"use client";

import { useActionState, type FormEvent } from "react";

import { archiveDocumentAction, type DocumentArchiveState } from "./actions";

export function DocumentArchive({
  clientId,
  documentId,
  operationId,
}: Readonly<{
  clientId: string;
  documentId: string;
  operationId: string;
}>) {
  const [state, action, pending] = useActionState(archiveDocumentAction, {
    status: "IDLE",
    operationId,
  } satisfies DocumentArchiveState);

  function confirmArchive(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        "Vill du arkivera dokumentet? Alla versioner bevaras och kan fortfarande hämtas.",
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={confirmArchive}>
      <input name="clientId" type="hidden" value={clientId} />
      <input name="documentId" type="hidden" value={documentId} />
      <input name="operationId" type="hidden" value={state.operationId} />
      <button
        className="secondary-button danger-button"
        disabled={pending}
        type="submit"
      >
        {pending ? "Arkiverar…" : "Arkivera dokument"}
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
