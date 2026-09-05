"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateAuditOperationId } from "@/modules/audit/audit";
import {
  beginMonthlyReportReplacement,
  createMonthlyReportDraft,
  MonthlyReportError,
  saveMonthlyReportDraft,
  signMonthlyReportDraft,
} from "@/modules/reports/monthly-reports";
import {
  getStructuredContentLength,
  STRUCTURED_CONTENT_MAX_LENGTH,
  type StructuredSectionValues,
} from "@/lib/structured-sections";

const GENERIC_ERROR = "Åtgärden kunde inte genomföras. Försök igen.";
const CONFLICT_ERROR =
  "Rapporten har ändrats i en annan session. Ladda om och granska igen.";
const UNAVAILABLE_ERROR =
  "Rapporten kan inte längre ändras. Ladda om sidan och kontrollera aktuell status.";

export type MonthlyReportActionState = Readonly<{
  status: "IDLE" | "SUCCESS" | "ERROR" | "CONFLICT";
  message?: string;
  fieldErrors?: Partial<Record<keyof StructuredSectionValues, string>>;
  values: StructuredSectionValues;
  monthlyReportId?: string;
  version?: number;
}>;

export type MonthlyReportMutationState = Readonly<{
  status: "IDLE" | "ERROR" | "CONFLICT";
  message?: string;
  operationId: string;
}>;

function readSections(formData: FormData): StructuredSectionValues {
  return {
    healthContent: String(formData.get("healthContent") ?? ""),
    educationOccupationContent: String(
      formData.get("educationOccupationContent") ?? "",
    ),
    emotionsBehaviorContent: String(
      formData.get("emotionsBehaviorContent") ?? "",
    ),
    socialRelationsContent: String(
      formData.get("socialRelationsContent") ?? "",
    ),
    dailyLivingIndependenceContent: String(
      formData.get("dailyLivingIndependenceContent") ?? "",
    ),
    otherContent: String(formData.get("otherContent") ?? ""),
  };
}

function reportErrorState(
  previousState: MonthlyReportActionState,
  values: StructuredSectionValues,
  error: unknown,
): MonthlyReportActionState {
  if (error instanceof MonthlyReportError) {
    if (error.code === "STALE_VERSION" || error.code === "SIGNING_CONFLICT") {
      return {
        ...previousState,
        status: "CONFLICT",
        message: CONFLICT_ERROR,
        values,
      };
    }
    if (error.code === "TARGET_UNAVAILABLE") {
      return {
        ...previousState,
        status: "ERROR",
        message: UNAVAILABLE_ERROR,
        values,
      };
    }
    if (error.code === "CONTENT_REQUIRED") {
      return {
        ...previousState,
        status: "ERROR",
        message: "Skriv minst en del av månadsrapporten innan du signerar.",
        values,
      };
    }
  }
  return { ...previousState, status: "ERROR", message: GENERIC_ERROR, values };
}

export async function createMonthlyReportDraftAction(
  _previousState: MonthlyReportMutationState,
  formData: FormData,
): Promise<MonthlyReportMutationState> {
  const clientId = String(formData.get("clientId") ?? "");
  let result;
  try {
    result = await createMonthlyReportDraft({
      clientId,
      calendarYear: Number(formData.get("calendarYear")),
      calendarMonth: Number(formData.get("calendarMonth")),
    });
  } catch (error) {
    const operationId = generateAuditOperationId();
    if (
      error instanceof MonthlyReportError &&
      error.code === "SIGNED_REPORT_EXISTS"
    ) {
      return {
        status: "ERROR",
        message: "Det finns redan en signerad rapport för den månaden.",
        operationId,
      };
    }
    if (
      error instanceof MonthlyReportError &&
      error.code === "TARGET_UNAVAILABLE"
    ) {
      return { status: "ERROR", message: UNAVAILABLE_ERROR, operationId };
    }
    return { status: "ERROR", message: GENERIC_ERROR, operationId };
  }
  revalidatePath(`/klienter/${clientId}/manadsrapporter`);
  redirect(`/klienter/${clientId}/manadsrapporter/utkast/${result.draft.id}`);
}

export async function saveMonthlyReportDraftAction(
  previousState: MonthlyReportActionState,
  formData: FormData,
): Promise<MonthlyReportActionState> {
  const values = readSections(formData);
  if (getStructuredContentLength(values) > STRUCTURED_CONTENT_MAX_LENGTH) {
    return {
      ...previousState,
      status: "ERROR",
      message: "Kontrollera uppgifterna i formuläret.",
      fieldErrors: {
        otherContent: `Månadsrapportens delar får sammanlagt innehålla högst ${STRUCTURED_CONTENT_MAX_LENGTH.toLocaleString("sv-SE")} tecken.`,
      },
      values,
    };
  }
  let report;
  try {
    report = await saveMonthlyReportDraft({
      monthlyReportId: String(formData.get("monthlyReportId") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion")),
      ...values,
    });
  } catch (error) {
    return reportErrorState(
      { ...previousState, fieldErrors: undefined },
      values,
      error,
    );
  }
  revalidatePath(`/klienter/${report.clientId}/manadsrapporter`);
  revalidatePath(
    `/klienter/${report.clientId}/manadsrapporter/utkast/${report.id}`,
  );
  if (String(formData.get("submitIntent")) === "review") {
    redirect(
      `/klienter/${report.clientId}/manadsrapporter/utkast/${report.id}/granska`,
    );
  }
  return {
    status: "SUCCESS",
    message: "Månadsrapporten har sparats.",
    values,
    monthlyReportId: report.id,
    version: report.version,
  };
}

export async function signMonthlyReportDraftAction(
  previousState: MonthlyReportMutationState,
  formData: FormData,
): Promise<MonthlyReportMutationState> {
  let report;
  try {
    report = await signMonthlyReportDraft({
      operationId: String(formData.get("operationId") ?? ""),
      monthlyReportId: String(formData.get("monthlyReportId") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion")),
    });
  } catch (error) {
    if (error instanceof MonthlyReportError) {
      if (error.code === "STALE_VERSION" || error.code === "SIGNING_CONFLICT") {
        return {
          ...previousState,
          status: "CONFLICT",
          message: CONFLICT_ERROR,
        };
      }
      if (error.code === "CONTENT_REQUIRED") {
        return {
          ...previousState,
          status: "ERROR",
          message: "Skriv minst en del av månadsrapporten innan du signerar.",
        };
      }
      if (error.code === "TARGET_UNAVAILABLE") {
        return {
          ...previousState,
          status: "ERROR",
          message: UNAVAILABLE_ERROR,
        };
      }
    }
    return { ...previousState, status: "ERROR", message: GENERIC_ERROR };
  }
  revalidatePath(`/klienter/${report.clientId}/manadsrapporter`);
  revalidatePath(`/klienter/${report.clientId}/manadsrapporter/${report.id}`);
  redirect(
    `/klienter/${report.clientId}/manadsrapporter/${report.id}?signerad=klar`,
  );
}

export async function beginMonthlyReportReplacementAction(
  previousState: MonthlyReportMutationState,
  formData: FormData,
): Promise<MonthlyReportMutationState> {
  let result;
  try {
    result = await beginMonthlyReportReplacement({
      monthlyReportId: String(formData.get("monthlyReportId") ?? ""),
    });
  } catch (error) {
    if (
      error instanceof MonthlyReportError &&
      error.code === "TARGET_UNAVAILABLE"
    ) {
      return { ...previousState, status: "ERROR", message: UNAVAILABLE_ERROR };
    }
    return { ...previousState, status: "ERROR", message: GENERIC_ERROR };
  }
  revalidatePath(`/klienter/${result.draft.clientId}/manadsrapporter`);
  redirect(
    `/klienter/${result.draft.clientId}/manadsrapporter/utkast/${result.draft.id}`,
  );
}
