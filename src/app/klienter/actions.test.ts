import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAssignment: vi.fn(),
  createClient: vi.fn(),
  endAssignment: vi.fn(),
  generateAuditOperationId: vi.fn(() => "123e4567-e89b-42d3-a456-426614174099"),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../modules/audit/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../modules/audit/audit")>()),
  generateAuditOperationId: mocks.generateAuditOperationId,
}));
vi.mock("../../modules/clients/clients", () => ({
  createAssignment: mocks.createAssignment,
  createClient: mocks.createClient,
  endAssignment: mocks.endAssignment,
}));

import { AuditError } from "../../modules/audit/audit";

import {
  createAssignmentAction,
  createClientAction,
  endAssignmentAction,
  type ClientActionState,
} from "./actions";

const operationId = "123e4567-e89b-42d3-a456-426614174000";
const clientId = "123e4567-e89b-42d3-a456-426614174001";
const assignmentId = "123e4567-e89b-42d3-a456-426614174002";
const initialState: ClientActionState = { status: "IDLE", operationId };

function clientForm(): FormData {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("firstName", "Fiktiv");
  form.set("lastName", "Klient");
  form.set("personIdentifier", "FIKTIV-01");
  form.set("category", "ADULT");
  return form;
}

function assignmentForm(): FormData {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("clientId", clientId);
  form.set("staffUserId", "fictional-staff-user");
  form.set("responsibility", "PRIMARY");
  return form;
}

function endForm(): FormData {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("assignmentId", assignmentId);
  return form;
}

describe("Client Server Action audit operation lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  const cases = [
    ["Client creation", createClientAction, mocks.createClient, clientForm],
    [
      "Assignment creation",
      createAssignmentAction,
      mocks.createAssignment,
      assignmentForm,
    ],
    ["Assignment ending", endAssignmentAction, mocks.endAssignment, endForm],
  ] as const;

  for (const [label, action, service, form] of cases) {
    it.each(["OPERATION_REQUIRES_REVIEW", "INCONSISTENT_OPERATION"] as const)(
      `${label} fails closed for %s without issuing a new operation ID`,
      async (code) => {
        service.mockRejectedValueOnce(new AuditError(code));

        await expect(action(initialState, form())).rejects.toMatchObject({
          code,
        });
        expect(service).toHaveBeenCalledTimes(1);
        expect(mocks.generateAuditOperationId).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      },
    );
  }

  it("uses the server-derived Client ID when an Assignment is ended", async () => {
    const trustedClientId = "123e4567-e89b-42d3-a456-426614174010";
    const form = endForm();
    form.set("clientId", "123e4567-e89b-42d3-a456-426614174011");
    mocks.endAssignment.mockResolvedValueOnce({ clientId: trustedClientId });

    await expect(
      endAssignmentAction(initialState, form),
    ).resolves.toMatchObject({ status: "SUCCESS" });
    expect(mocks.endAssignment).toHaveBeenCalledWith({
      operationId,
      assignmentId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/klienter");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/klienter/${trustedClientId}`,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith(
      "/klienter/123e4567-e89b-42d3-a456-426614174011",
    );
  });
});
