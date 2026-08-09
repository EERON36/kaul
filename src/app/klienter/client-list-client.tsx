"use client";

import Link from "next/link";
import { useActionState } from "react";

import { getClientStatusLabel } from "@/modules/clients/client-presentation";
import type { ClientListItem } from "@/modules/clients/clients";

import { createClientAction, type ClientActionState } from "./actions";

export function ClientList({
  clients,
  canCreate,
  operationId,
}: Readonly<{
  clients: readonly ClientListItem[];
  canCreate: boolean;
  operationId: string;
}>) {
  const initialState: ClientActionState = { status: "IDLE", operationId };
  const [state, action, pending] = useActionState(
    createClientAction,
    initialState,
  );

  return (
    <>
      {canCreate ? (
        <section
          aria-labelledby="create-client-heading"
          className="client-section"
        >
          <h2 id="create-client-heading">Skapa klient</h2>
          <form action={action}>
            <input name="operationId" type="hidden" value={state.operationId} />
            <div className="form-field">
              <label htmlFor="client-first-name">Förnamn</label>
              <input
                id="client-first-name"
                maxLength={100}
                name="firstName"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="client-last-name">Efternamn</label>
              <input
                id="client-last-name"
                maxLength={100}
                name="lastName"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="client-person-identifier">Personreferens</label>
              <input
                aria-describedby="client-person-identifier-help"
                id="client-person-identifier"
                maxLength={64}
                name="personIdentifier"
                required
              />
              <p className="form-help" id="client-person-identifier-help">
                Ange organisationens interna referens, inte personnummer.
              </p>
            </div>
            <div className="form-field">
              <label htmlFor="client-category">Kategori</label>
              <input
                id="client-category"
                maxLength={100}
                name="category"
                required
              />
            </div>
            <button className="primary-button" disabled={pending} type="submit">
              {pending ? "Skapar…" : "Skapa klient"}
            </button>
            <p
              aria-live="polite"
              className={
                state.status === "ERROR" ? "form-error" : "form-status"
              }
            >
              {state.message}
            </p>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="client-list-heading" className="client-section">
        <h2 id="client-list-heading">Klientlista</h2>
        {clients.length === 0 ? (
          <p>Det finns inga klienter som du kan öppna.</p>
        ) : (
          <ul className="client-list">
            {clients.map((client) => (
              <li key={client.id}>
                <Link
                  className="client-list-link"
                  href={`/klienter/${client.id}`}
                >
                  <span className="client-list-name">
                    {client.firstName} {client.lastName}
                  </span>
                  <span className="client-identifier">
                    {client.personIdentifier}
                  </span>
                  <span>{client.category}</span>
                  <span>Status: {getClientStatusLabel(client.status)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
