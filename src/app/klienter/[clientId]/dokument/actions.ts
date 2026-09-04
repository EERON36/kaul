"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateAuditOperationId } from "@/modules/audit/audit";
import { archiveDocument } from "@/modules/documents/documents";

export type DocumentArchiveState = Readonly<{
  status: "IDLE" | "ERROR";
  message?: string;
  operationId: string;
}>;

export async function archiveDocumentAction(
  _previousState: DocumentArchiveState,
  formData: FormData,
): Promise<DocumentArchiveState> {
  const clientId = String(formData.get("clientId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  try {
    await archiveDocument({
      operationId: String(formData.get("operationId") ?? ""),
      clientId,
      documentId,
    });
  } catch {
    return {
      status: "ERROR",
      message:
        "Dokumentet kunde inte arkiveras. Ladda om sidan och kontrollera aktuell status.",
      operationId: generateAuditOperationId(),
    };
  }
  revalidatePath(`/klienter/${clientId}/dokument`);
  revalidatePath(`/klienter/${clientId}/dokument/${documentId}`);
  redirect(`/klienter/${clientId}/dokument/${documentId}?arkiverat=klar`);
}
