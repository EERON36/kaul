"use client";

import { useActionState, type FormEvent } from "react";

import {
  createAssignmentAction,
  endAssignmentAction,
  type ClientActionState,
} from "../actions";

type StaffOption = Readonly<{
  id: string;
  name: string;
  professionalTitle: string;
}>;

type AssignmentItem = Readonly<{
  id: string;
  responsibility: "PRIMARY" | "SECONDARY";
  startedAt: Date;
  endedAt: Date | null;
  staffUser: StaffOption;
  operationId: string;
}>;

function EndAssignmentControl({
  assignment,
}: Readonly<{ assignment: AssignmentItem }>) {
  const initial: ClientActionState = {
    status: "IDLE",
    operationId: assignment.operationId,
  };
  const [state, action, pending] = useActionState(endAssignmentAction, initial);

  function confirmEnd(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Vill du avsluta den här tilldelningen?")) {
      event.preventDefault();
    }
  }

  if (assignment.endedAt) {
    return (
      <p aria-live="polite" className="form-status">
        {state.message ?? "Tilldelningen är avslutad."}
      </p>
    );
  }

  return (
    <form action={action} onSubmit={confirmEnd}>
      <input name="operationId" type="hidden" value={state.operationId} />
      <input name="assignmentId" type="hidden" value={assignment.id} />
      <button
        className="secondary-button danger-button"
        disabled={pending}
        type="submit"
      >
        {pending ? "Avslutar…" : "Avsluta tilldelning"}
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

export function AssignmentManagement({
  clientId,
  assignments,
  staff,
  createOperationId,
}: Readonly<{
  clientId: string;
  assignments: readonly AssignmentItem[];
  staff: readonly StaffOption[];
  createOperationId: string;
}>) {
  const initial: ClientActionState = {
    status: "IDLE",
    operationId: createOperationId,
  };
  const [state, action, pending] = useActionState(
    createAssignmentAction,
    initial,
  );

  return (
    <section aria-labelledby="assignment-heading" className="client-section">
      <h2 id="assignment-heading">Ansvarig personal</h2>
      <form action={action}>
        <input name="operationId" type="hidden" value={state.operationId} />
        <input name="clientId" type="hidden" value={clientId} />
        <div className="form-field">
          <label htmlFor="assignment-staff">Medarbetare</label>
          <select id="assignment-staff" name="staffUserId" required>
            <option value="">Välj medarbetare</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} – {member.professionalTitle}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="assignment-responsibility">Ansvar</label>
          <select id="assignment-responsibility" name="responsibility" required>
            <option value="PRIMARY">Primär</option>
            <option value="SECONDARY">Sekundär</option>
          </select>
        </div>
        <button
          className="primary-button"
          disabled={pending || staff.length === 0}
          type="submit"
        >
          {pending ? "Sparar…" : "Lägg till tilldelning"}
        </button>
        <p
          aria-live="polite"
          className={state.status === "ERROR" ? "form-error" : "form-status"}
        >
          {state.message}
        </p>
      </form>

      {assignments.length === 0 ? (
        <p>Klienten har inga tilldelningar ännu.</p>
      ) : (
        <ul className="assignment-list">
          {assignments.map((assignment) => (
            <li key={assignment.id}>
              <div>
                <h3>{assignment.staffUser.name}</h3>
                <p>{assignment.staffUser.professionalTitle}</p>
                <p>
                  <strong>Ansvar:</strong>{" "}
                  {assignment.responsibility === "PRIMARY"
                    ? "Primär"
                    : "Sekundär"}
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  {assignment.endedAt ? "Avslutad" : "Aktiv"}
                </p>
              </div>
              <EndAssignmentControl assignment={assignment} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
