"use server";

import { revalidatePath } from "next/cache";

import { generateAuditOperationId } from "@/modules/audit/audit";
import { getClientManagementFeedback } from "@/modules/clients/client-feedback";
import {
  createAssignment,
  createClient,
  endAssignment,
} from "@/modules/clients/clients";

export type ClientActionState = Readonly<{
  status: "IDLE" | "ERROR" | "SUCCESS";
  operationId: string;
  message?: string;
}>;

export async function createClientAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  try {
    await createClient({
      operationId,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      personIdentifier: String(formData.get("personIdentifier") ?? ""),
      category: String(formData.get("category") ?? ""),
    });
    revalidatePath("/klienter");
    return {
      status: "SUCCESS",
      operationId: generateAuditOperationId(),
      message: "Klienten har skapats.",
    };
  } catch (error) {
    const message = getClientManagementFeedback(error);
    if (!message) throw error;
    return {
      status: "ERROR",
      operationId: generateAuditOperationId(),
      message,
    };
  }
}

export async function createAssignmentAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  try {
    await createAssignment({
      operationId,
      clientId,
      staffUserId: String(formData.get("staffUserId") ?? ""),
      responsibility: String(formData.get("responsibility") ?? "") as
        "PRIMARY" | "SECONDARY",
    });
    revalidatePath("/klienter");
    revalidatePath(`/klienter/${clientId}`);
    return {
      status: "SUCCESS",
      operationId: generateAuditOperationId(),
      message: "Tilldelningen har sparats.",
    };
  } catch (error) {
    const message = getClientManagementFeedback(error);
    if (!message) throw error;
    return {
      status: "ERROR",
      operationId: generateAuditOperationId(),
      message,
    };
  }
}

export async function endAssignmentAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  try {
    const result = await endAssignment({
      operationId,
      assignmentId: String(formData.get("assignmentId") ?? ""),
    });
    revalidatePath("/klienter");
    revalidatePath(`/klienter/${result.clientId}`);
    return {
      status: "SUCCESS",
      operationId: generateAuditOperationId(),
      message: "Tilldelningen har avslutats.",
    };
  } catch (error) {
    const message = getClientManagementFeedback(error);
    if (!message) throw error;
    return {
      status: "ERROR",
      operationId: generateAuditOperationId(),
      message,
    };
  }
}
