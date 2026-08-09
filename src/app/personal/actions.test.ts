import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAuditOperationId: vi.fn(() => "123e4567-e89b-42d3-a456-426614174099"),
  resetStaffPassword: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../modules/audit/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../modules/audit/audit")>()),
  generateAuditOperationId: mocks.generateAuditOperationId,
}));
vi.mock("../../modules/users/staff-password-reset", () => ({
  resetStaffPassword: mocks.resetStaffPassword,
}));

import { AuditError } from "../../modules/audit/audit";
import { StaffManagementError } from "../../modules/users/staff-management";

import {
  resetStaffPasswordAction,
  type StaffPasswordResetActionState,
} from "./actions";

const operationId = "123e4567-e89b-42d3-a456-426614174000";
const initialState: StaffPasswordResetActionState = {
  status: "IDLE",
  operationId,
};

function resetForm(): FormData {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("targetUserId", "fictional-staff-user");
  return form;
}

describe("Staff password reset Server Action", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["OPERATION_REQUIRES_REVIEW", "INCONSISTENT_OPERATION"] as const)(
    "fails closed for %s without issuing a replacement operation ID",
    async (code) => {
      mocks.resetStaffPassword.mockRejectedValueOnce(new AuditError(code));

      await expect(
        resetStaffPasswordAction(initialState, resetForm()),
      ).rejects.toMatchObject({ code });
      expect(mocks.generateAuditOperationId).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("does not convert an integrity failure into ordinary feedback", async () => {
    const error = new StaffManagementError("INCONSISTENT_RESULT");
    mocks.resetStaffPassword.mockRejectedValueOnce(error);

    await expect(
      resetStaffPasswordAction(initialState, resetForm()),
    ).rejects.toBe(error);
    expect(mocks.generateAuditOperationId).not.toHaveBeenCalled();
  });

  it("issues a fresh operation ID after a definitive controlled failure", async () => {
    mocks.resetStaffPassword.mockRejectedValueOnce(
      new StaffManagementError("RESET_ALREADY_PENDING"),
    );

    await expect(
      resetStaffPasswordAction(initialState, resetForm()),
    ).resolves.toMatchObject({
      status: "ERROR",
      operationId: "123e4567-e89b-42d3-a456-426614174099",
    });
    expect(mocks.generateAuditOperationId).toHaveBeenCalledOnce();
  });

  it("returns the credential only after service success", async () => {
    mocks.resetStaffPassword.mockResolvedValueOnce({
      temporaryCredential: "Fictional temporary credential 2032",
      temporaryCredentialExpiresAt: new Date("2032-02-03T04:05:06.000Z"),
    });

    const result = await resetStaffPasswordAction(initialState, resetForm());

    expect(result).toMatchObject({
      status: "SUCCESS",
      temporaryCredential: "Fictional temporary credential 2032",
      temporaryCredentialExpiresAt: "2032-02-03T04:05:06.000Z",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
