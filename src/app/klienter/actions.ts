"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateAuditOperationId } from "@/modules/audit/audit";
import { getClientManagementFeedback } from "@/modules/clients/client-feedback";
import { updateClientInputSchema } from "@/modules/clients/client-input";
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
  clientId?: string;
}>;

export type ClientEditFormValues = Readonly<{
  firstName: string;
  lastName: string;
  personIdentifier: string;
  category: string;
  personalIdentityNumber: string;
  placingUnit: string;
  legalBasis: string;
  responsibleSocialWorkerName: string;
  responsibleSocialWorkerPhone: string;
  responsibleSocialWorkerEmail: string;
}>;

export type ClientEditActionState = ClientActionState &
  Readonly<{
    values?: ClientEditFormValues;
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
    const created = await createClient({
      operationId,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      personIdentifier: String(formData.get("personIdentifier") ?? ""),
      personalIdentityNumber: String(
        formData.get("personalIdentityNumber") ?? "",
      ),
      placingUnit: String(formData.get("placingUnit") ?? ""),
      legalBasis: String(formData.get("legalBasis") ?? ""),
      responsibleSocialWorkerName: String(
        formData.get("responsibleSocialWorkerName") ?? "",
      ),
      responsibleSocialWorkerPhone: String(
        formData.get("responsibleSocialWorkerPhone") ?? "",
      ),
      responsibleSocialWorkerEmail: String(
        formData.get("responsibleSocialWorkerEmail") ?? "",
      ),
      category: String(formData.get("category") ?? ""),
    });
    revalidatePath("/");
    revalidatePath("/klienter");
    return {
      status: "SUCCESS",
      operationId: generateAuditOperationId(),
      message:
        "Klienten har skapats. Lägg till en primär tilldelning för att aktivera klienten.",
      clientId: created.id,
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
    revalidatePath("/");
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
  revalidatePath("/");
  revalidatePath("/klienter/arkiverade");
  revalidatePath(`/klienter/${trustedClientId}`);
  redirect(`/klienter/${trustedClientId}?arkiverad=klar`);
}

export async function updateClientAction(
  _previousState: ClientEditActionState,
  formData: FormData,
): Promise<ClientEditActionState> {
  const operationId = String(formData.get("operationId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  try {
    const submittedInput = {
      operationId,
      clientId,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      personIdentifier: String(formData.get("personIdentifier") ?? ""),
      personalIdentityNumber: String(
        formData.get("personalIdentityNumber") ?? "",
      ),
      placingUnit: String(formData.get("placingUnit") ?? ""),
      legalBasis: String(formData.get("legalBasis") ?? ""),
      responsibleSocialWorkerName: String(
        formData.get("responsibleSocialWorkerName") ?? "",
      ),
      responsibleSocialWorkerPhone: String(
        formData.get("responsibleSocialWorkerPhone") ?? "",
      ),
      responsibleSocialWorkerEmail: String(
        formData.get("responsibleSocialWorkerEmail") ?? "",
      ),
      category: String(formData.get("category") ?? ""),
    };
    const result = await updateClient(submittedInput);
    const values = updateClientInputSchema.parse(submittedInput);
    revalidatePath("/");
    revalidatePath("/klienter");
    revalidatePath(`/klienter/${result.client.id}`);
    return {
      status: "SUCCESS",
      operationId: generateAuditOperationId(),
      message: result.changed
        ? "Klientuppgifterna har sparats."
        : "Det finns inga ändringar att spara.",
      values: {
        firstName: values.firstName,
        lastName: values.lastName,
        personIdentifier: values.personIdentifier,
        category: values.category,
        personalIdentityNumber: values.personalIdentityNumber ?? "",
        placingUnit: values.placingUnit ?? "",
        legalBasis: values.legalBasis ?? "",
        responsibleSocialWorkerName: values.responsibleSocialWorkerName ?? "",
        responsibleSocialWorkerPhone: values.responsibleSocialWorkerPhone ?? "",
        responsibleSocialWorkerEmail: values.responsibleSocialWorkerEmail ?? "",
      },
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
    revalidatePath("/");
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
