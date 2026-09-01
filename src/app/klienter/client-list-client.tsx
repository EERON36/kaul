"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  CLIENT_CATEGORY_LABELS,
  getClientCategoryLabel,
  groupClientsByCategory,
} from "@/modules/clients/client-category";
import { getClientStatusLabel } from "@/modules/clients/client-presentation";
import type { ClientListItem } from "@/modules/clients/clients";

import {
  createClientAction,
  searchClientsAction,
  type ClientActionState,
  type ClientSearchActionState,
} from "./actions";
import {
  filterClientsForCategoryView,
  type ClientCategoryView,
} from "./client-category-view";

const categoryChoices = [
  { href: "/klienter", label: "Vuxna", value: "ADULT" },
  {
    href: "/klienter?kategori=ungdomar",
    label: "Ungdomar",
    value: "YOUTH",
  },
] as const;

export function ClientList({
  activeCategoryView,
  clients,
  canCreate,
  operationId,
  showPrimaryStaff,
}: Readonly<{
  activeCategoryView: ClientCategoryView;
  clients: readonly ClientListItem[];
  canCreate: boolean;
  operationId: string;
  showPrimaryStaff: boolean;
}>) {
  const initialState: ClientActionState = { status: "IDLE", operationId };
  const [state, action, pending] = useActionState(
    createClientAction,
    initialState,
  );
  const initialSearchState: ClientSearchActionState = {
    status: "IDLE",
    clients,
    query: "",
    searched: false,
  };
  const [searchState, searchAction, searchPending] = useActionState(
    searchClientsAction,
    initialSearchState,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const availableClients = searchState.searched ? searchState.clients : clients;
  const displayedClients = filterClientsForCategoryView(
    availableClients,
    activeCategoryView,
  );
  const activeCategoryLabel =
    activeCategoryView === "ALL"
      ? "Alla klienter"
      : CLIENT_CATEGORY_LABELS[activeCategoryView];

  return (
    <>
      <section
        aria-labelledby="client-category-view-heading"
        className="client-section client-category-view"
      >
        <h2 id="client-category-view-heading">Välj klientkategori</h2>
        <nav aria-label="Klientkategori">
          <div className="client-category-primary-choices">
            {categoryChoices.map((choice) => (
              <Link
                aria-current={
                  activeCategoryView === choice.value ? "page" : undefined
                }
                className="client-category-choice"
                href={choice.href}
                key={choice.value}
              >
                {choice.label}
              </Link>
            ))}
          </div>
          <Link
            aria-current={activeCategoryView === "ALL" ? "page" : undefined}
            className="client-category-all-choice"
            href="/klienter?kategori=alla"
          >
            Alla klienter
          </Link>
        </nav>
      </section>

      {canCreate ? (
        <p>
          <Link href="/klienter/arkiverade">Visa arkiverade klienter</Link>
        </p>
      ) : null}

      <section
        aria-labelledby="client-search-heading"
        className="client-section"
      >
        <h2 id="client-search-heading">Sök klienter</h2>
        <form action={searchAction} className="client-search-form">
          <div className="form-field">
            <label htmlFor="client-search-query">Sök klienter</label>
            <input
              autoComplete="off"
              id="client-search-query"
              maxLength={100}
              name="query"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Namn eller personreferens"
              value={searchQuery}
            />
          </div>
          <button
            className="primary-button"
            disabled={searchPending}
            type="submit"
          >
            {searchPending ? "Söker…" : "Sök"}
          </button>
        </form>
        {searchState.searched ? (
          <form
            action={searchAction}
            className="client-search-reset"
            onSubmit={() => setSearchQuery("")}
          >
            <input name="query" type="hidden" value="" />
            <button
              className="secondary-button"
              disabled={searchPending}
              type="submit"
            >
              Rensa sökning
            </button>
          </form>
        ) : null}
        <p
          aria-live="polite"
          className={
            searchState.status === "ERROR" ? "form-error" : "form-status"
          }
        >
          {searchState.message}
        </p>
      </section>

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
              <select
                id="client-category"
                name="category"
                required
                defaultValue=""
              >
                <option disabled value="">
                  Välj kategori
                </option>
                <option value="ADULT">{CLIENT_CATEGORY_LABELS.ADULT}</option>
                <option value="YOUTH">{CLIENT_CATEGORY_LABELS.YOUTH}</option>
              </select>
            </div>
            <fieldset className="client-extended-fields">
              <legend>Övriga klientuppgifter (valfritt)</legend>
              <div className="form-field">
                <label htmlFor="client-personal-identity-number">
                  Personnummer
                </label>
                <input
                  aria-describedby="client-personal-identity-number-help"
                  autoComplete="off"
                  id="client-personal-identity-number"
                  maxLength={32}
                  name="personalIdentityNumber"
                />
                <p
                  className="form-help"
                  id="client-personal-identity-number-help"
                >
                  Känslig uppgift. Fyll endast i om organisationens rutiner
                  tillåter det.
                </p>
              </div>
              <div className="form-field">
                <label htmlFor="client-placing-unit">Placerande enhet</label>
                <input
                  id="client-placing-unit"
                  maxLength={200}
                  name="placingUnit"
                />
              </div>
              <div className="form-field">
                <label htmlFor="client-legal-basis">Lagrum</label>
                <input
                  id="client-legal-basis"
                  maxLength={200}
                  name="legalBasis"
                />
              </div>
            </fieldset>
            <fieldset className="client-extended-fields">
              <legend>Ansvarig socialsekreterare (valfritt)</legend>
              <div className="form-field">
                <label htmlFor="client-responsible-social-worker-name">
                  Namn
                </label>
                <input
                  id="client-responsible-social-worker-name"
                  maxLength={200}
                  name="responsibleSocialWorkerName"
                />
              </div>
              <div className="form-field">
                <label htmlFor="client-responsible-social-worker-phone">
                  Telefon
                </label>
                <input
                  id="client-responsible-social-worker-phone"
                  maxLength={64}
                  name="responsibleSocialWorkerPhone"
                  type="tel"
                />
              </div>
              <div className="form-field">
                <label htmlFor="client-responsible-social-worker-email">
                  E-post
                </label>
                <input
                  id="client-responsible-social-worker-email"
                  maxLength={254}
                  name="responsibleSocialWorkerEmail"
                  type="email"
                />
              </div>
            </fieldset>
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
            {state.status === "SUCCESS" && state.clientId ? (
              <Link
                className="primary-button button-link client-create-result-link"
                href={`/klienter/${state.clientId}`}
              >
                Öppna klienten och lägg till tilldelning
              </Link>
            ) : null}
          </form>
        </section>
      ) : null}

      <section aria-labelledby="client-list-heading" className="client-section">
        <h2 id="client-list-heading">Klientlista</h2>
        {displayedClients.length === 0 ? (
          <p>
            {activeCategoryView === "ALL"
              ? searchState.searched
                ? "Inga klienter matchar din sökning."
                : "Det finns inga klienter som du kan öppna."
              : searchState.searched
                ? `Inga klienter under ${activeCategoryLabel} matchar din sökning.`
                : `Det finns inga klienter under ${activeCategoryLabel} som du kan öppna.`}
          </p>
        ) : (
          <div className="client-category-groups">
            {groupClientsByCategory(displayedClients).map((group) => (
              <section
                aria-labelledby={`client-category-${group.key}`}
                className="client-category-group"
                key={group.key}
              >
                <h3 id={`client-category-${group.key}`}>{group.label}</h3>
                <ul className="client-list">
                  {group.clients.map((client) => (
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
                        <span>{getClientCategoryLabel(client.category)}</span>
                        <span>
                          Status: {getClientStatusLabel(client.status)}
                        </span>
                        {showPrimaryStaff ? (
                          <span>
                            <strong>Primäransvarig:</strong>{" "}
                            {client.primaryStaff
                              ? `${client.primaryStaff.name} – ${client.primaryStaff.professionalTitle}`
                              : "Ingen aktiv primär ansvarig"}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
