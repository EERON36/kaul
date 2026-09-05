"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { useNavigationGuard } from "@/components/navigation-guard";
import { CLIENT_CATEGORY_LABELS } from "@/modules/clients/client-category";

import { updateClientAction, type ClientActionState } from "../actions";

type EditableClient = Readonly<{
  id: string;
  firstName: string;
  lastName: string;
  personIdentifier: string;
  category: string;
  personalIdentityNumber?: string | null;
  placingUnit?: string | null;
  legalBasis?: string | null;
  responsibleSocialWorkerName?: string | null;
  responsibleSocialWorkerPhone?: string | null;
  responsibleSocialWorkerEmail?: string | null;
}>;

type ClientEditFormValues = Readonly<{
  firstName: string;
  lastName: string;
  personIdentifier: string;
  category: string;
  personalIdentityNumber: string;
  placingUnit: string;
  legalBasis: string;
  responsibleSocialWorkerName: string;
  responsibleSocialWorkerPhone: string;
  responsibleSocialWorkerEmail: string;
}>;

const clientEditFormFieldNames = [
  "firstName",
  "lastName",
  "personIdentifier",
  "category",
  "personalIdentityNumber",
  "placingUnit",
  "legalBasis",
  "responsibleSocialWorkerName",
  "responsibleSocialWorkerPhone",
  "responsibleSocialWorkerEmail",
] as const;

function getInitialClientEditFormValues(
  client: EditableClient,
): ClientEditFormValues {
  return {
    firstName: client.firstName,
    lastName: client.lastName,
    personIdentifier: client.personIdentifier,
    category: client.category,
    personalIdentityNumber: client.personalIdentityNumber ?? "",
    placingUnit: client.placingUnit ?? "",
    legalBasis: client.legalBasis ?? "",
    responsibleSocialWorkerName: client.responsibleSocialWorkerName ?? "",
    responsibleSocialWorkerPhone: client.responsibleSocialWorkerPhone ?? "",
    responsibleSocialWorkerEmail: client.responsibleSocialWorkerEmail ?? "",
  };
}

function readClientEditFormValues(form: HTMLFormElement): ClientEditFormValues {
  const formData = new FormData(form);
  return {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    personIdentifier: String(formData.get("personIdentifier") ?? ""),
    category: String(formData.get("category") ?? ""),
    personalIdentityNumber: String(
      formData.get("personalIdentityNumber") ?? "",
    ),
    placingUnit: String(formData.get("placingUnit") ?? ""),
    legalBasis: String(formData.get("legalBasis") ?? ""),
    responsibleSocialWorkerName: String(
      formData.get("responsibleSocialWorkerName") ?? "",
    ),
    responsibleSocialWorkerPhone: String(
      formData.get("responsibleSocialWorkerPhone") ?? "",
    ),
    responsibleSocialWorkerEmail: String(
      formData.get("responsibleSocialWorkerEmail") ?? "",
    ),
  };
}

export function areClientEditFormValuesEqual(
  left: ClientEditFormValues,
  right: ClientEditFormValues,
) {
  return clientEditFormFieldNames.every((fieldName) =>
    Object.is(left[fieldName], right[fieldName]),
  );
}

export function ClientEdit({
  client,
  operationId,
  startEditing = false,
}: Readonly<{
  client: EditableClient;
  operationId: string;
  startEditing?: boolean;
}>) {
  const [editing, setEditing] = useState(startEditing);
  const hasApprovedCategory =
    client.category === "ADULT" || client.category === "YOUTH";
  const initialState: ClientActionState = { status: "IDLE", operationId };
  const [state, action, pending] = useActionState(
    updateClientAction,
    initialState,
  );
  const setNavigationBlocked = useNavigationGuard();
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const initialValuesRef = useRef(getInitialClientEditFormValues(client));
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!editing) editTriggerRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (state.status !== "SUCCESS" || !formRef.current) return;
    initialValuesRef.current = readClientEditFormValues(formRef.current);
    dirtyRef.current = false;
    setNavigationBlocked(false);
  }, [setNavigationBlocked, state.status]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  useEffect(
    () => () => {
      setNavigationBlocked(false);
    },
    [setNavigationBlocked],
  );

  function handleFormChange(form: HTMLFormElement) {
    const dirty = !areClientEditFormValuesEqual(
      initialValuesRef.current,
      readClientEditFormValues(form),
    );
    dirtyRef.current = dirty;
    setNavigationBlocked(dirty);
  }

  function cancelEditing() {
    if (
      dirtyRef.current &&
      !window.confirm(
        "Vill du avbryta redigeringen? Dina osparade ändringar försvinner.",
      )
    ) {
      return;
    }
    dirtyRef.current = false;
    setNavigationBlocked(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        className="secondary-button client-edit-trigger"
        onClick={() => setEditing(true)}
        ref={editTriggerRef}
        type="button"
      >
        Redigera klient
      </button>
    );
  }

  return (
    <section aria-labelledby="edit-client-heading" className="client-section">
      <h2 id="edit-client-heading">Redigera klient</h2>
      <form
        action={action}
        aria-busy={pending}
        onChange={(event) => handleFormChange(event.currentTarget)}
        ref={formRef}
      >
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
        <fieldset className="client-extended-fields">
          <legend>Övriga klientuppgifter (valfritt)</legend>
          <div className="form-field">
            <label htmlFor="edit-client-personal-identity-number">
              Personnummer
            </label>
            <input
              aria-describedby="edit-client-personal-identity-number-help"
              autoComplete="off"
              defaultValue={client.personalIdentityNumber ?? ""}
              id="edit-client-personal-identity-number"
              maxLength={32}
              name="personalIdentityNumber"
            />
            <p
              className="form-help"
              id="edit-client-personal-identity-number-help"
            >
              Känslig uppgift. Fyll endast i om organisationens rutiner tillåter
              det.
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="edit-client-placing-unit">Placerande enhet</label>
            <input
              defaultValue={client.placingUnit ?? ""}
              id="edit-client-placing-unit"
              maxLength={200}
              name="placingUnit"
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-client-legal-basis">Lagrum</label>
            <input
              defaultValue={client.legalBasis ?? ""}
              id="edit-client-legal-basis"
              maxLength={200}
              name="legalBasis"
            />
          </div>
        </fieldset>
        <fieldset className="client-extended-fields">
          <legend>Ansvarig socialsekreterare (valfritt)</legend>
          <div className="form-field">
            <label htmlFor="edit-client-responsible-social-worker-name">
              Namn
            </label>
            <input
              defaultValue={client.responsibleSocialWorkerName ?? ""}
              id="edit-client-responsible-social-worker-name"
              maxLength={200}
              name="responsibleSocialWorkerName"
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-client-responsible-social-worker-phone">
              Telefon
            </label>
            <input
              defaultValue={client.responsibleSocialWorkerPhone ?? ""}
              id="edit-client-responsible-social-worker-phone"
              maxLength={50}
              name="responsibleSocialWorkerPhone"
              type="tel"
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-client-responsible-social-worker-email">
              E-post
            </label>
            <input
              defaultValue={client.responsibleSocialWorkerEmail ?? ""}
              id="edit-client-responsible-social-worker-email"
              maxLength={254}
              name="responsibleSocialWorkerEmail"
              type="email"
            />
          </div>
        </fieldset>
        <div className="form-actions">
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Sparar…" : "Spara ändringar"}
          </button>
          <button
            className="secondary-button"
            disabled={pending}
            onClick={cancelEditing}
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
