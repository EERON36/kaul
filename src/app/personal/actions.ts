"use server";

import { revalidatePath } from "next/cache";

import { generateAuditOperationId } from "@/modules/audit/audit";
import {
  createStaffMember,
  deactivateStaffMember,
  reactivateStaffMember,
} from "@/modules/users/staff-management";
import { getStaffManagementFeedback } from "@/modules/users/staff-management-feedback";
import { resetStaffPassword } from "@/modules/users/staff-password-reset";

export type CreateStaffActionState = Readonly<{
  status: "IDLE" | "ERROR" | "SUCCESS";
  operationId: string;
  message?: string;
  temporaryCredential?: string;
  temporaryCredentialExpiresAt?: string;
}>;

export type StaffStatusActionState = Readonly<{
  status: "IDLE" | "ERROR" | "SUCCESS";
  message?: string;
}>;

export type StaffPasswordResetActionState = Readonly<{
  status: "IDLE" | "ERROR" | "SUCCESS";
  operationId: string;
  message?: string;
  temporaryCredential?: string;
  temporaryCredentialExpiresAt?: string;
}>;

export async function createStaffAction(
  _previousState: CreateStaffActionState,
  formData: FormData,
): Promise<CreateStaffActionState> {
  try {
    const result = await createStaffMember({
      operationId: String(formData.get("operationId") ?? ""),
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      professionalTitle: String(formData.get("professionalTitle") ?? ""),
    });
    revalidatePath("/personal");

    return {
      status: "SUCCESS",
      operationId: generateAuditOperationId(),
      message:
        "Kontot har skapats. Lämna den tillfälliga inloggningsuppgiften på ett säkert sätt.",
      temporaryCredential: result.temporaryCredential,
      temporaryCredentialExpiresAt:
        result.temporaryCredentialExpiresAt.toISOString(),
    };
  } catch (error) {
    const message = getStaffManagementFeedback(error);
    if (!message) {
      throw error;
    }

    return {
      status: "ERROR",
      operationId: generateAuditOperationId(),
      message,
    };
  }
}

async function changeStatus(
  operation: typeof deactivateStaffMember | typeof reactivateStaffMember,
  successMessage: string,
  formData: FormData,
): Promise<StaffStatusActionState> {
  try {
    await operation({
      operationId: String(formData.get("operationId") ?? ""),
      targetUserId: String(formData.get("targetUserId") ?? ""),
    });
    revalidatePath("/personal");
    return { status: "SUCCESS", message: successMessage };
  } catch (error) {
    const message = getStaffManagementFeedback(error);
    if (!message) {
      throw error;
    }

    return { status: "ERROR", message };
  }
}

export async function deactivateStaffAction(
  _previousState: StaffStatusActionState,
  formData: FormData,
): Promise<StaffStatusActionState> {
  return await changeStatus(
    deactivateStaffMember,
    "Medarbetaren har inaktiverats.",
    formData,
  );
}

export async function reactivateStaffAction(
  _previousState: StaffStatusActionState,
  formData: FormData,
): Promise<StaffStatusActionState> {
  return await changeStatus(
    reactivateStaffMember,
    "Medarbetaren har återaktiverats.",
    formData,
  );
}

export async function resetStaffPasswordAction(
  _previousState: StaffPasswordResetActionState,
  formData: FormData,
): Promise<StaffPasswordResetActionState> {
  try {
    const result = await resetStaffPassword({
      operationId: String(formData.get("operationId") ?? ""),
      targetUserId: String(formData.get("targetUserId") ?? ""),
    });

    return {
      status: "SUCCESS",
      operationId: generateAuditOperationId(),
      message: "Lösenordet har återställts.",
      temporaryCredential: result.temporaryCredential,
      temporaryCredentialExpiresAt:
        result.temporaryCredentialExpiresAt.toISOString(),
    };
  } catch (error) {
    const message = getStaffManagementFeedback(error);
    if (!message) {
      throw error;
    }

    return {
      status: "ERROR",
      operationId: generateAuditOperationId(),
      message,
    };
  }
}
