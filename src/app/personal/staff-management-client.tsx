"use client";

import { useActionState, type FormEvent } from "react";

import type { StaffMemberListItem } from "@/modules/users/staff-management";

import {
  createStaffAction,
  deactivateStaffAction,
  reactivateStaffAction,
  resetStaffPasswordAction,
  type CreateStaffActionState,
  type StaffPasswordResetActionState,
  type StaffStatusActionState,
} from "./actions";

type StaffManagementProps = Readonly<{
  createOperationId: string;
  staff: readonly (StaffMemberListItem &
    Readonly<{ operationId: string; resetOperationId: string }>)[];
}>;

const initialStatusState: StaffStatusActionState = { status: "IDLE" };

function StaffStatusControl({
  member,
}: Readonly<{
  member: StaffMemberListItem & Readonly<{ operationId: string }>;
}>) {
  const action = member.active ? deactivateStaffAction : reactivateStaffAction;
  const [state, formAction, isPending] = useActionState(
    action,
    initialStatusState,
  );

  function confirmDeactivation(event: FormEvent<HTMLFormElement>) {
    if (
      member.active &&
      !window.confirm(
        `Vill du inaktivera ${member.name}? Personen loggas ut och kan inte logga in igen.`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmDeactivation}>
      <input name="operationId" type="hidden" value={member.operationId} />
      <input name="targetUserId" type="hidden" value={member.id} />
      <button
        className={
          member.active ? "secondary-button danger-button" : "secondary-button"
        }
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Sparar…" : member.active ? "Inaktivera" : "Återaktivera"}
      </button>
      <p
        aria-live="polite"
        className={state.status === "ERROR" ? "form-error" : "form-status"}
      >
        {state.message}
      </p>
    </form>
  );
}

function StaffPasswordResetControl({
  member,
}: Readonly<{
  member: StaffMemberListItem & Readonly<{ resetOperationId: string }>;
}>) {
  const initialState: StaffPasswordResetActionState = {
    status: "IDLE",
    operationId: member.resetOperationId,
  };
  const [state, formAction, isPending] = useActionState(
    resetStaffPasswordAction,
    initialState,
  );

  function confirmReset(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Vill du återställa lösenordet för ${member.name}? Alla personens befintliga sessioner avslutas.`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <div>
      {state.status === "SUCCESS" ? null : (
        <form action={formAction} onSubmit={confirmReset}>
          <input name="operationId" type="hidden" value={state.operationId} />
          <input name="targetUserId" type="hidden" value={member.id} />
          <button
            className="secondary-button"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Återställer…" : "Återställ lösenord"}
          </button>
        </form>
      )}
      <div
        aria-live="polite"
        className={
          state.status === "ERROR" ? "form-error" : "credential-result"
        }
      >
        {state.message ? <p>{state.message}</p> : null}
        {state.temporaryCredential ? (
          <>
            <p>
              <strong>Tillfälligt lösenord:</strong>{" "}
              <code>{state.temporaryCredential}</code>
            </p>
            <p>
              Giltigt till:{" "}
              {new Intl.DateTimeFormat("sv-SE", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(state.temporaryCredentialExpiresAt ?? ""))}
            </p>
            <p>
              Lösenordet visas bara nu, gäller i 24 timmar och måste bytas vid
              nästa inloggning. Godkänd leveranskanal för produktion är ännu
              inte beslutad.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function StaffManagement({
  createOperationId,
  staff,
}: StaffManagementProps) {
  const initialCreateState: CreateStaffActionState = {
    status: "IDLE",
    operationId: createOperationId,
  };
  const [createState, createAction, isCreating] = useActionState(
    createStaffAction,
    initialCreateState,
  );

  return (
    <>
      <section aria-labelledby="create-staff-heading" className="staff-section">
        <h2 id="create-staff-heading">Lägg till personal</h2>
        <p id="staff-create-help">
          En tillfällig inloggningsuppgift skapas och visas bara efter att
          kontot har sparats.
        </p>
        <form
          action={createAction}
          aria-describedby="staff-create-help staff-create-result"
        >
          <input
            name="operationId"
            type="hidden"
            value={createState.operationId}
          />
          <div className="form-field">
            <label htmlFor="staff-name">Namn</label>
            <input id="staff-name" maxLength={200} name="name" required />
          </div>
          <div className="form-field">
            <label htmlFor="staff-email">E-post</label>
            <input
              autoComplete="off"
              id="staff-email"
              maxLength={254}
              name="email"
              required
              type="email"
            />
          </div>
          <div className="form-field">
            <label htmlFor="staff-title">Yrkestitel</label>
            <input
              id="staff-title"
              maxLength={120}
              name="professionalTitle"
              required
            />
          </div>
          <button
            className="primary-button"
            disabled={isCreating}
            type="submit"
          >
            {isCreating ? "Skapar…" : "Skapa medarbetare"}
          </button>
        </form>

        <div
          aria-live="polite"
          className={
            createState.status === "ERROR" ? "form-error" : "credential-result"
          }
          id="staff-create-result"
        >
          {createState.message ? <p>{createState.message}</p> : null}
          {createState.temporaryCredential ? (
            <>
              <p>
                <strong>Tillfällig inloggningsuppgift:</strong>{" "}
                <code>{createState.temporaryCredential}</code>
              </p>
              <p>
                Giltig till:{" "}
                {new Intl.DateTimeFormat("sv-SE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(
                  new Date(createState.temporaryCredentialExpiresAt ?? ""),
                )}
              </p>
              <p>Spara uppgiften säkert nu. Den visas inte igen.</p>
            </>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="staff-list-heading" className="staff-section">
        <h2 id="staff-list-heading">Medarbetare</h2>
        {staff.length === 0 ? (
          <p>Det finns inga medarbetare ännu.</p>
        ) : (
          <ul className="staff-list">
            {staff.map((member) => (
              <li className="staff-card" key={member.id}>
                <div>
                  <h3>{member.name}</h3>
                  <p>{member.professionalTitle}</p>
                  <p>{member.email}</p>
                  <p>
                    <strong>Status:</strong>{" "}
                    {member.active ? "Aktiv" : "Inaktiv"}
                  </p>
                </div>
                <div>
                  {member.canResetPassword ? (
                    <StaffPasswordResetControl member={member} />
                  ) : null}
                  <StaffStatusControl member={member} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
