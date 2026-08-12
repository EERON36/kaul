"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateAuditOperationId } from "@/modules/audit/audit";
import { getClientManagementFeedback } from "@/modules/clients/client-feedback";
import {
  archiveClient,
  createAssignment,
  createClient,
  endAssignment,
  searchClients,
  updateClient,
  type ClientListItem,
} from "@/modules/clients/clients";

export type ClientActionState = Readonly<{
  status: "IDLE" | "ERROR" | "SUCCESS";
  operationId: string;
  message?: string;
}>;

export type ClientSearchActionState = Readonly<{
  status: "IDLE" | "ERROR" | "SUCCESS";
  clients: readonly ClientListItem[];
  query: string;
  searched: boolean;
  message?: string;
}>;

const CLIENT_SEARCH_ERROR_MESSAGE =
  "Sökningen kunde inte genomföras. Kontrollera söktexten och försök igen.";

export async function searchClientsAction(
  previousState: ClientSearchActionState,
  formData: FormData,
): Promise<ClientSearchActionState> {
  try {
    const result = await searchClients(String(formData.get("query") ?? ""));
    return {
      status: "SUCCESS",
      clients: result.clients,
      query: result.query,
      searched: result.query.length > 0,
    };
  } catch {
    return {
      ...previousState,
      status: "ERROR",
      message: CLIENT_SEARCH_ERROR_MESSAGE,
    };
  }
}

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

export async function archiveClientAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  let trustedClientId: string;
  try {
    const result = await archiveClient({ operationId, clientId });
    trustedClientId = result.clientId;
  } catch (error) {
    const message = getClientManagementFeedback(error);
    if (!message) throw error;
    return {
      status: "ERROR",
      operationId: generateAuditOperationId(),
      message,
    };
  }

  revalidatePath("/klienter");
  revalidatePath("/klienter/arkiverade");
  revalidatePath(`/klienter/${trustedClientId}`);
  redirect(`/klienter/${trustedClientId}?arkiverad=klar`);
}

export async function updateClientAction(
  _previousState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  try {
    const result = await updateClient({
      operationId,
      clientId,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      personIdentifier: String(formData.get("personIdentifier") ?? ""),
      category: String(formData.get("category") ?? ""),
    });
    revalidatePath("/klienter");
    revalidatePath(`/klienter/${result.client.id}`);
    return {
      status: "SUCCESS",
      operationId: generateAuditOperationId(),
      message: result.changed
        ? "Klientuppgifterna har sparats."
        : "Det finns inga ändringar att spara.",
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
