"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateAuditOperationId } from "@/modules/audit/audit";
import {
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  PlanningError,
  reassignFollowUp,
  updateFollowUp,
} from "@/modules/planning/planning";

import {
  readFollowUpFormValues,
  type FollowUpFormFieldErrors,
  type FollowUpFormValues,
} from "./follow-up-form-values";

const GENERIC_ERROR = "Åtgärden kunde inte genomföras. Försök igen.";
const STALE_MESSAGE =
  "Uppföljningen har ändrats i en annan session. Dina ändringar har inte sparats. Ladda om sidan och granska den aktuella versionen.";
const UNAVAILABLE_MESSAGE =
  "Uppföljningen kan inte längre ändras. Ladda om sidan och kontrollera aktuell status.";

export type FollowUpFormActionState = Readonly<{
  status: "IDLE" | "ERROR" | "CONFLICT";
  message?: string;
  fieldErrors?: FollowUpFormFieldErrors;
  values: FollowUpFormValues;
  followUpId?: string;
  version?: number;
  responsibleName?: string;
}>;

export type FollowUpMutationActionState = Readonly<{
  status: "IDLE" | "ERROR" | "CONFLICT";
  message?: string;
  operationId: string;
}>;

function followUpFormErrorState(
  previousState: FollowUpFormActionState,
  values: FollowUpFormValues,
  error: unknown,
): FollowUpFormActionState {
  if (error instanceof PlanningError && error.code === "STALE_VERSION") {
    return {
      ...previousState,
      status: "CONFLICT",
      message: STALE_MESSAGE,
      values,
    };
  }
  if (
    error instanceof PlanningError &&
    error.code === "INVALID_RESPONSIBLE_USER"
  ) {
    return {
      ...previousState,
      status: "ERROR",
      message:
        "Den valda ansvariga personen har inte längre behörighet till klienten. Välj en annan person.",
      fieldErrors: {
        responsibleUserId: "Välj en behörig ansvarig medarbetare.",
      },
      values,
    };
  }
  if (error instanceof PlanningError && error.code === "INVALID_GOAL_LINK") {
    return {
      ...previousState,
      status: "ERROR",
      message: "Det valda målet kan inte längre kopplas till uppföljningen.",
      fieldErrors: { goalId: "Välj ett aktuellt mål eller lämna fältet tomt." },
      values,
    };
  }
  if (
    error instanceof PlanningError &&
    (error.code === "TARGET_UNAVAILABLE" || error.code === "INVALID_STATE")
  ) {
    return {
      ...previousState,
      status: "ERROR",
      message: UNAVAILABLE_MESSAGE,
      values,
    };
  }
  return { ...previousState, status: "ERROR", message: GENERIC_ERROR, values };
}

function revalidateFollowUp(clientId: string, followUpId: string) {
  revalidatePath("/");
  revalidatePath(`/klienter/${clientId}/uppfoljningar`);
  revalidatePath(`/klienter/${clientId}/uppfoljningar/${followUpId}`);
}

export async function saveFollowUpAction(
  previousState: FollowUpFormActionState,
  formData: FormData,
): Promise<FollowUpFormActionState> {
  const parsed = readFollowUpFormValues(formData);
  if (!parsed.input) {
    return {
      ...previousState,
      status: "ERROR",
      message: "Kontrollera uppgifterna i formuläret.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }
  const followUpId = String(formData.get("followUpId") ?? "");
  let followUp;
  try {
    followUp = followUpId
      ? (
          await updateFollowUp({
            followUpId,
            expectedVersion: Number(formData.get("expectedVersion")),
            title: parsed.input.title,
            description: parsed.input.description,
            dueDate: parsed.input.dueDate,
            dueTime: parsed.input.dueTime,
            goalId: parsed.input.goalId,
          })
        ).followUp
      : await createFollowUp({
          clientId: String(formData.get("clientId") ?? ""),
          ...parsed.input,
        });
  } catch (error) {
    return followUpFormErrorState(previousState, parsed.values, error);
  }
  revalidateFollowUp(followUp.clientId, followUp.id);
  redirect(
    `/klienter/${followUp.clientId}/uppfoljningar/${followUp.id}?${followUpId ? "sparad" : "skapad"}=klar`,
  );
}

export async function reassignFollowUpAction(
  _previousState: FollowUpMutationActionState,
  formData: FormData,
): Promise<FollowUpMutationActionState> {
  let result;
  try {
    result = await reassignFollowUp({
      operationId: String(formData.get("operationId") ?? ""),
      followUpId: String(formData.get("followUpId") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion")),
      responsibleUserId: String(formData.get("responsibleUserId") ?? ""),
    });
  } catch (error) {
    const operationId = generateAuditOperationId();
    if (error instanceof PlanningError && error.code === "STALE_VERSION")
      return { status: "CONFLICT", message: STALE_MESSAGE, operationId };
    if (
      error instanceof PlanningError &&
      error.code === "INVALID_RESPONSIBLE_USER"
    )
      return {
        status: "ERROR",
        message:
          "Den valda personen har inte längre behörighet till klienten. Ladda om sidan och välj en annan person.",
        operationId,
      };
    if (
      error instanceof PlanningError &&
      (error.code === "TARGET_UNAVAILABLE" || error.code === "INVALID_STATE")
    )
      return { status: "ERROR", message: UNAVAILABLE_MESSAGE, operationId };
    return { status: "ERROR", message: GENERIC_ERROR, operationId };
  }
  revalidateFollowUp(result.followUp.clientId, result.followUp.id);
  redirect(
    `/klienter/${result.followUp.clientId}/uppfoljningar/${result.followUp.id}?ansvarig=sparad`,
  );
}

export async function changeFollowUpStatusAction(
  _previousState: FollowUpMutationActionState,
  formData: FormData,
): Promise<FollowUpMutationActionState> {
  const transition = String(formData.get("transition") ?? "");
  const input = {
    operationId: String(formData.get("operationId") ?? ""),
    followUpId: String(formData.get("followUpId") ?? ""),
    expectedVersion: Number(formData.get("expectedVersion")),
  };
  let followUp;
  try {
    followUp =
      transition === "complete"
        ? await completeFollowUp(input)
        : transition === "cancel"
          ? await cancelFollowUp(input)
          : null;
    if (!followUp) throw new Error("Unsupported Follow-up transition.");
  } catch (error) {
    const operationId = generateAuditOperationId();
    if (error instanceof PlanningError && error.code === "STALE_VERSION")
      return { status: "CONFLICT", message: STALE_MESSAGE, operationId };
    if (
      error instanceof PlanningError &&
      (error.code === "TARGET_UNAVAILABLE" || error.code === "INVALID_STATE")
    )
      return { status: "ERROR", message: UNAVAILABLE_MESSAGE, operationId };
    return { status: "ERROR", message: GENERIC_ERROR, operationId };
  }
  revalidateFollowUp(followUp.clientId, followUp.id);
  redirect(
    `/klienter/${followUp.clientId}/uppfoljningar/${followUp.id}?status=andrad`,
  );
}
