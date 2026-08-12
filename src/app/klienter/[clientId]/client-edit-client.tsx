"use client";

import { useActionState, useState } from "react";

import { CLIENT_CATEGORY_LABELS } from "@/modules/clients/client-category";

import { updateClientAction, type ClientActionState } from "../actions";

type EditableClient = Readonly<{
  id: string;
  firstName: string;
  lastName: string;
  personIdentifier: string;
  category: string;
}>;

export function ClientEdit({
  client,
  operationId,
}: Readonly<{ client: EditableClient; operationId: string }>) {
  const [editing, setEditing] = useState(false);
  const hasApprovedCategory =
    client.category === "ADULT" || client.category === "YOUTH";
  const initialState: ClientActionState = { status: "IDLE", operationId };
  const [state, action, pending] = useActionState(
    updateClientAction,
    initialState,
  );

  if (!editing) {
    return (
      <button
        className="secondary-button client-edit-trigger"
        onClick={() => setEditing(true)}
        type="button"
      >
        Redigera klient
      </button>
    );
  }

  return (
    <section aria-labelledby="edit-client-heading" className="client-section">
      <h2 id="edit-client-heading">Redigera klient</h2>
      <form action={action}>
        <input name="operationId" type="hidden" value={state.operationId} />
        <input name="clientId" type="hidden" value={client.id} />
        <div className="form-field">
          <label htmlFor="edit-client-first-name">Förnamn</label>
          <input
            defaultValue={client.firstName}
            id="edit-client-first-name"
            maxLength={100}
            name="firstName"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="edit-client-last-name">Efternamn</label>
          <input
            defaultValue={client.lastName}
            id="edit-client-last-name"
            maxLength={100}
            name="lastName"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="edit-client-person-identifier">Personreferens</label>
          <input
            aria-describedby="edit-client-person-identifier-help"
            defaultValue={client.personIdentifier}
            id="edit-client-person-identifier"
            maxLength={64}
            name="personIdentifier"
            required
          />
          <p className="form-help" id="edit-client-person-identifier-help">
            Ange organisationens interna referens, inte personnummer.
          </p>
        </div>
        <div className="form-field">
          <label htmlFor="edit-client-category">Kategori</label>
          <select
            defaultValue={client.category}
            id="edit-client-category"
            name="category"
            required
          >
            {!hasApprovedCategory ? (
              <option disabled value={client.category}>
                Okänd kategori – välj Vuxna eller Ungdomar
              </option>
            ) : null}
            <option value="ADULT">{CLIENT_CATEGORY_LABELS.ADULT}</option>
            <option value="YOUTH">{CLIENT_CATEGORY_LABELS.YOUTH}</option>
          </select>
        </div>
        <div className="form-actions">
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Sparar…" : "Spara ändringar"}
          </button>
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => setEditing(false)}
            type="button"
          >
            Avbryt
          </button>
        </div>
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
