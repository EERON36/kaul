"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  beginJournalCorrectionAction,
  signJournalDraftAction,
  type JournalMutationActionState,
} from "./actions";

export function SignJournalControl({
  journalEntryId,
  operationId,
  version,
}: Readonly<{
  journalEntryId: string;
  operationId: string;
  version: number;
}>) {
  const initialState: JournalMutationActionState = {
    status: "IDLE",
    operationId,
  };
  const [state, action, pending] = useActionState(
    signJournalDraftAction,
    initialState,
  );

  return (
    <form action={action}>
      <input name="operationId" type="hidden" value={state.operationId} />
      <input name="journalEntryId" type="hidden" value={journalEntryId} />
      <input name="expectedVersion" type="hidden" value={version} />
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Signerar…" : "Signera anteckning"}
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

export function BeginJournalCorrectionControl({
  clientId,
  originalEntryId,
}: Readonly<{ clientId: string; originalEntryId: string }>) {
  const initialState: JournalMutationActionState = { status: "IDLE" };
  const [state, action, pending] = useActionState(
    beginJournalCorrectionAction,
    initialState,
  );

  return (
    <form action={action} className="journal-correction-action">
      <input name="originalEntryId" type="hidden" value={originalEntryId} />
      <button className="secondary-button" disabled={pending} type="submit">
        {pending ? "Skapar…" : "Skapa rättelse"}
      </button>
      <div
        aria-live="polite"
        className="form-error"
        role={state.message ? "alert" : undefined}
      >
        {state.message}
        {state.status === "CONFLICT" ? (
          <span className="status-action">
            <Link href={`/klienter/${clientId}/anteckningar/utkast`}>
              Öppna utkast
            </Link>
          </span>
        ) : null}
      </div>
    </form>
  );
}
