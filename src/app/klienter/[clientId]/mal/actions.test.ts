import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveGoal: vi.fn(),
  completeGoal: vi.fn(),
  createGoal: vi.fn(),
  pauseGoal: vi.fn(),
  resumeGoal: vi.fn(),
  updateGoal: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/planning/planning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/planning/planning")>()),
  archiveGoal: mocks.archiveGoal,
  completeGoal: mocks.completeGoal,
  createGoal: mocks.createGoal,
  pauseGoal: mocks.pauseGoal,
  resumeGoal: mocks.resumeGoal,
  updateGoal: mocks.updateGoal,
}));

import { PlanningError } from "@/modules/planning/planning";

import {
  changeGoalStatusAction,
  saveGoalAction,
  type GoalFormActionState,
} from "./actions";

const clientId = "123e4567-e89b-42d3-a456-426614174101";
const goalId = "123e4567-e89b-42d3-a456-426614174102";
const initialState: GoalFormActionState = {
  status: "IDLE",
  values: {
    title: "Tidigare mål",
    description: "",
    startDate: "2026-08-14",
    targetDate: "",
  },
  goalId,
  version: 1,
};

function goalForm() {
  const form = new FormData();
  form.set("clientId", clientId);
  form.set("goalId", goalId);
  form.set("expectedVersion", "1");
  form.set("title", "Uppdaterat mål");
  form.set("description", "Fiktiv beskrivning.");
  form.set("startDate", "2026-08-14");
  form.set("targetDate", "2026-09-14");
  return form;
}

describe("Goal Server Action feedback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps entered values and returns Swedish field errors", async () => {
    const form = goalForm();
    form.set("title", "   ");

    const result = await saveGoalAction(initialState, form);

    expect(result).toMatchObject({
      status: "ERROR",
      values: { title: "   ", description: "Fiktiv beskrivning." },
      fieldErrors: { title: "Ange en rubrik för målet." },
    });
    expect(mocks.updateGoal).not.toHaveBeenCalled();
  });

  it("rejects a stale edit without exposing backend details", async () => {
    mocks.updateGoal.mockRejectedValueOnce(new PlanningError("STALE_VERSION"));

    const result = await saveGoalAction(initialState, goalForm());

    expect(result).toMatchObject({
      status: "CONFLICT",
      values: { title: "Uppdaterat mål" },
      message: expect.stringContaining("annan session"),
    });
  });

  it("rotates the audited operation identifier after a terminal conflict", async () => {
    mocks.completeGoal.mockRejectedValueOnce(
      new PlanningError("INVALID_STATE"),
    );
    const form = new FormData();
    form.set("goalId", goalId);
    form.set("expectedVersion", "1");
    form.set("operationId", "123e4567-e89b-42d3-a456-426614174103");
    form.set("transition", "complete");

    const result = await changeGoalStatusAction(
      {
        status: "IDLE",
        operationId: "123e4567-e89b-42d3-a456-426614174103",
      },
      form,
    );

    expect(result.status).toBe("ERROR");
    expect(result.operationId).not.toBe("123e4567-e89b-42d3-a456-426614174103");
  });
});
