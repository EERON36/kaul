"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { useNavigationGuard } from "@/components/navigation-guard";
import { CLIENT_CATEGORY_LABELS } from "@/modules/clients/client-category";

import {
  updateClientAction,
  type ClientEditActionState,
  type ClientEditFormValues,
} from "../actions";

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
  const [formValues, setFormValues] = useState(() =>
    getInitialClientEditFormValues(client),
  );
  const initialState: ClientEditActionState = { status: "IDLE", operationId };
  const setNavigationBlocked = useNavigationGuard();
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const initialValuesRef = useRef(formValues);
  const wasEditingRef = useRef(editing);
  const dirtyRef = useRef(false);
  const saveClient = useCallback(
    async (
      previousState: ClientEditActionState,
      submittedFormData: FormData,
    ) => {
      const nextState = await updateClientAction(
        previousState,
        submittedFormData,
      );
      if (nextState.status === "SUCCESS" && nextState.values) {
        setFormValues(nextState.values);
        initialValuesRef.current = nextState.values;
        dirtyRef.current = false;
        setNavigationBlocked(false);
      }
      return nextState;
    },
    [setNavigationBlocked],
  );
  const [state, action, pending] = useActionState(saveClient, initialState);
  const hasApprovedCategory =
    formValues.category === "ADULT" || formValues.category === "YOUTH";

  useEffect(() => {
    const returnedToEditTrigger = wasEditingRef.current && !editing;
    wasEditingRef.current = editing;
    if (returnedToEditTrigger) editTriggerRef.current?.focus();
  }, [editing]);

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

  function handleFormChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const form = event.currentTarget.form;
    if (!form) return;
    const nextValues = readClientEditFormValues(form);
    setFormValues(nextValues);
    const dirty = !areClientEditFormValuesEqual(
      initialValuesRef.current,
      nextValues,
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
    setFormValues(initialValuesRef.current);
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
      <form action={action} aria-busy={pending}>
        <input name="operationId" type="hidden" value={state.operationId} />
        <input name="clientId" type="hidden" value={client.id} />
        <div className="form-field">
          <label htmlFor="edit-client-first-name">Förnamn</label>
          <input
            value={formValues.firstName}
            disabled={pending}
            id="edit-client-first-name"
            maxLength={100}
            name="firstName"
            onChange={handleFormChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="edit-client-last-name">Efternamn</label>
          <input
            value={formValues.lastName}
            disabled={pending}
            id="edit-client-last-name"
            maxLength={100}
            name="lastName"
            onChange={handleFormChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="edit-client-person-identifier">Personreferens</label>
          <input
            aria-describedby="edit-client-person-identifier-help"
            value={formValues.personIdentifier}
            disabled={pending}
            id="edit-client-person-identifier"
            maxLength={64}
            name="personIdentifier"
            onChange={handleFormChange}
            required
          />
          <p className="form-help" id="edit-client-person-identifier-help">
            Ange organisationens interna referens, inte personnummer.
          </p>
        </div>
        <div className="form-field">
          <label htmlFor="edit-client-category">Kategori</label>
          <select
            value={formValues.category}
            disabled={pending}
            id="edit-client-category"
            name="category"
            onChange={handleFormChange}
            required
          >
            {!hasApprovedCategory ? (
              <option disabled value={formValues.category}>
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
              value={formValues.personalIdentityNumber}
              disabled={pending}
              id="edit-client-personal-identity-number"
              maxLength={32}
              name="personalIdentityNumber"
              onChange={handleFormChange}
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
              value={formValues.placingUnit}
              disabled={pending}
              id="edit-client-placing-unit"
              maxLength={200}
              name="placingUnit"
              onChange={handleFormChange}
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-client-legal-basis">Lagrum</label>
            <input
              value={formValues.legalBasis}
              disabled={pending}
              id="edit-client-legal-basis"
              maxLength={200}
              name="legalBasis"
              onChange={handleFormChange}
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
              value={formValues.responsibleSocialWorkerName}
              disabled={pending}
              id="edit-client-responsible-social-worker-name"
              maxLength={200}
              name="responsibleSocialWorkerName"
              onChange={handleFormChange}
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-client-responsible-social-worker-phone">
              Telefon
            </label>
            <input
              value={formValues.responsibleSocialWorkerPhone}
              disabled={pending}
              id="edit-client-responsible-social-worker-phone"
              maxLength={50}
              name="responsibleSocialWorkerPhone"
              onChange={handleFormChange}
              type="tel"
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-client-responsible-social-worker-email">
              E-post
            </label>
            <input
              value={formValues.responsibleSocialWorkerEmail}
              disabled={pending}
              id="edit-client-responsible-social-worker-email"
              maxLength={254}
              name="responsibleSocialWorkerEmail"
              onChange={handleFormChange}
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
