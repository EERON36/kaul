"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateAuditOperationId } from "@/modules/audit/audit";
import {
  archiveGoal,
  completeGoal,
  createGoal,
  pauseGoal,
  PlanningError,
  resumeGoal,
  updateGoal,
} from "@/modules/planning/planning";

import {
  readGoalFormValues,
  type GoalFormFieldErrors,
  type GoalFormValues,
} from "./goal-form-values";

const GENERIC_ERROR = "Åtgärden kunde inte genomföras. Försök igen.";
const STALE_MESSAGE =
  "Målet har ändrats i en annan session. Dina ändringar har inte sparats. Ladda om sidan och granska den aktuella versionen.";
const UNAVAILABLE_MESSAGE =
  "Målet kan inte längre ändras. Ladda om sidan och kontrollera aktuell status.";

export type GoalFormActionState = Readonly<{
  status: "IDLE" | "ERROR" | "CONFLICT";
  message?: string;
  fieldErrors?: GoalFormFieldErrors;
  values: GoalFormValues;
  goalId?: string;
  version?: number;
}>;

export type GoalMutationActionState = Readonly<{
  status: "IDLE" | "ERROR" | "CONFLICT";
  message?: string;
  operationId: string;
}>;

function goalErrorState(
  previousState: GoalFormActionState,
  values: GoalFormValues,
  error: unknown,
): GoalFormActionState {
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

export async function saveGoalAction(
  previousState: GoalFormActionState,
  formData: FormData,
): Promise<GoalFormActionState> {
  const parsed = readGoalFormValues(formData);
  if (!parsed.input) {
    return {
      ...previousState,
      status: "ERROR",
      message: "Kontrollera uppgifterna i formuläret.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }

  const goalId = String(formData.get("goalId") ?? "");
  let goal;
  try {
    goal = goalId
      ? (
          await updateGoal({
            goalId,
            expectedVersion: Number(formData.get("expectedVersion")),
            ...parsed.input,
          })
        ).goal
      : await createGoal({
          clientId: String(formData.get("clientId") ?? ""),
          ...parsed.input,
        });
  } catch (error) {
    return goalErrorState(previousState, parsed.values, error);
  }
  revalidatePath(`/klienter/${goal.clientId}/mal`);
  revalidatePath(`/klienter/${goal.clientId}/mal/${goal.id}`);
  redirect(
    `/klienter/${goal.clientId}/mal/${goal.id}?${goalId ? "sparat" : "skapat"}=klar`,
  );
}

export async function changeGoalStatusAction(
  _previousState: GoalMutationActionState,
  formData: FormData,
): Promise<GoalMutationActionState> {
  const goalId = String(formData.get("goalId") ?? "");
  const expectedVersion = Number(formData.get("expectedVersion"));
  const transition = String(formData.get("transition") ?? "");
  let goal;
  try {
    goal =
      transition === "pause"
        ? (await pauseGoal({ goalId, expectedVersion })).goal
        : transition === "resume"
          ? (await resumeGoal({ goalId, expectedVersion })).goal
          : transition === "complete"
            ? await completeGoal({
                goalId,
                expectedVersion,
                operationId: String(formData.get("operationId") ?? ""),
              })
            : transition === "archive"
              ? await archiveGoal({
                  goalId,
                  expectedVersion,
                  operationId: String(formData.get("operationId") ?? ""),
                })
              : null;
    if (!goal) throw new Error("Unsupported Goal transition.");
  } catch (error) {
    const operationId = generateAuditOperationId();
    if (error instanceof PlanningError && error.code === "STALE_VERSION") {
      return { status: "CONFLICT", message: STALE_MESSAGE, operationId };
    }
    if (
      error instanceof PlanningError &&
      (error.code === "TARGET_UNAVAILABLE" || error.code === "INVALID_STATE")
    ) {
      return { status: "ERROR", message: UNAVAILABLE_MESSAGE, operationId };
    }
    return { status: "ERROR", message: GENERIC_ERROR, operationId };
  }
  revalidatePath(`/klienter/${goal.clientId}/mal`);
  revalidatePath(`/klienter/${goal.clientId}/mal/${goal.id}`);
  redirect(`/klienter/${goal.clientId}/mal/${goal.id}?status=andrad`);
}
