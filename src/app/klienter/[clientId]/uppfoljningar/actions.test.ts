import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelFollowUp: vi.fn(),
  completeFollowUp: vi.fn(),
  createFollowUp: vi.fn(),
  reassignFollowUp: vi.fn(),
  updateFollowUp: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/planning/planning", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/planning/planning")>()),
  cancelFollowUp: mocks.cancelFollowUp,
  completeFollowUp: mocks.completeFollowUp,
  createFollowUp: mocks.createFollowUp,
  reassignFollowUp: mocks.reassignFollowUp,
  updateFollowUp: mocks.updateFollowUp,
}));

import { PlanningError } from "@/modules/planning/planning";

import {
  reassignFollowUpAction,
  saveFollowUpAction,
  type FollowUpFormActionState,
} from "./actions";

const clientId = "123e4567-e89b-42d3-a456-426614174201";
const followUpId = "123e4567-e89b-42d3-a456-426614174202";
const responsibleUserId = "fictional-responsible-user";
const initialState: FollowUpFormActionState = {
  status: "IDLE",
  values: {
    title: "Tidigare uppföljning",
    description: "",
    dueDate: "2026-08-20",
    dueTime: "",
    responsibleUserId,
    goalId: "",
  },
  followUpId,
  version: 1,
};

function followUpForm() {
  const form = new FormData();
  form.set("clientId", clientId);
  form.set("followUpId", followUpId);
  form.set("expectedVersion", "1");
  form.set("title", "Uppdaterad uppföljning");
  form.set("description", "Fiktiv beskrivning.");
  form.set("dueDate", "2026-08-21");
  form.set("dueTime", "09:30");
  form.set("responsibleUserId", responsibleUserId);
  form.set("goalId", "");
  return form;
}

describe("Follow-up Server Action feedback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps entered values when the due date is invalid", async () => {
    const form = followUpForm();
    form.set("dueDate", "2026-02-30");

    const result = await saveFollowUpAction(initialState, form);

    expect(result).toMatchObject({
      status: "ERROR",
      values: { title: "Uppdaterad uppföljning", dueDate: "2026-02-30" },
      fieldErrors: { dueDate: "Ange ett giltigt datum för uppföljningen." },
    });
    expect(mocks.updateFollowUp).not.toHaveBeenCalled();
  });

  it("returns a calm conflict without overwriting a stale Follow-up", async () => {
    mocks.updateFollowUp.mockRejectedValueOnce(
      new PlanningError("STALE_VERSION"),
    );

    const result = await saveFollowUpAction(initialState, followUpForm());

    expect(result).toMatchObject({
      status: "CONFLICT",
      message: expect.stringContaining("annan session"),
      values: { title: "Uppdaterad uppföljning" },
    });
  });

  it("maps ineligible reassignment safely and rotates the operation identifier", async () => {
    mocks.reassignFollowUp.mockRejectedValueOnce(
      new PlanningError("INVALID_RESPONSIBLE_USER"),
    );
    const operationId = "123e4567-e89b-42d3-a456-426614174203";
    const form = new FormData();
    form.set("operationId", operationId);
    form.set("followUpId", followUpId);
    form.set("expectedVersion", "1");
    form.set("responsibleUserId", "ineligible-user");

    const result = await reassignFollowUpAction(
      { status: "IDLE", operationId },
      form,
    );

    expect(result).toMatchObject({
      status: "ERROR",
      message: expect.stringContaining("inte längre behörighet"),
    });
    expect(result.operationId).not.toBe(operationId);
  });
});
