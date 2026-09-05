"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  beginJournalCorrection,
  createJournalDraft,
  discardJournalDraft,
  getCurrentJournalDraft,
  getSignedJournalEntry,
  JournalError,
  replaceJournalDraftGoals,
  saveJournalDraft,
  signJournalDraft,
  type JournalEntryRecord,
} from "@/modules/journal/journal";

import {
  readJournalFormValues,
  type JournalFormFieldErrors,
  type JournalFormValues,
} from "./journal-form-values";

const GENERIC_ERROR = "Åtgärden kunde inte genomföras. Försök igen.";
const STALE_DRAFT_MESSAGE =
  "Utkastet har ändrats i en annan session. Dina ändringar har inte sparats. Ladda om utkastet och granska det sparade innehållet.";
const LOST_ACCESS_MESSAGE =
  "Du har inte längre behörighet till klienten. Ändringarna har inte sparats.";
const PARTIAL_GOAL_SAVE_MESSAGE =
  "Anteckningen sparades, men målkopplingarna kunde inte uppdateras. Ladda om utkastet och kontrollera målen innan du fortsätter.";
const SIGNING_CONFLICT_MESSAGE =
  "Anteckningen kunde inte signeras eftersom den har ändrats eller redan signerats. Ladda om och granska igen.";

export type JournalDraftActionState = Readonly<{
  status: "IDLE" | "ERROR" | "SUCCESS" | "STALE" | "PARTIAL";
  message?: string;
  fieldErrors?: JournalFormFieldErrors;
  values: JournalFormValues;
  journalEntryId?: string;
  version?: number;
}>;

export type JournalMutationActionState = Readonly<{
  status: "IDLE" | "ERROR" | "CONFLICT";
  message?: string;
  operationId?: string;
}>;

function draftErrorState(
  previousState: JournalDraftActionState,
  values: JournalFormValues,
  error: unknown,
): JournalDraftActionState {
  if (error instanceof JournalError && error.code === "STALE_VERSION") {
    return {
      ...previousState,
      status: "STALE",
      message: STALE_DRAFT_MESSAGE,
      values,
    };
  }
  if (error instanceof JournalError && error.code === "TARGET_UNAVAILABLE") {
    return {
      ...previousState,
      status: "ERROR",
      message: LOST_ACCESS_MESSAGE,
      values,
    };
  }
  return {
    ...previousState,
    status: "ERROR",
    message: GENERIC_ERROR,
    values,
  };
}

export async function saveJournalDraftAction(
  previousState: JournalDraftActionState,
  formData: FormData,
): Promise<JournalDraftActionState> {
  const parsedForm = readJournalFormValues(formData);
  if (
    Object.keys(parsedForm.fieldErrors).length > 0 ||
    !parsedForm.eventOccurredAt ||
    !parsedForm.entryType
  ) {
    return {
      ...previousState,
      status: "ERROR",
      message: "Kontrollera uppgifterna i formuläret.",
      fieldErrors: parsedForm.fieldErrors,
      values: parsedForm.values,
    };
  }

  const clientId = String(formData.get("clientId") ?? "");
  const journalEntryId = String(formData.get("journalEntryId") ?? "");
  const expectedVersion = Number(formData.get("expectedVersion"));
  const submitIntent = String(formData.get("submitIntent") ?? "save");
  let saved: JournalEntryRecord;

  try {
    if (journalEntryId) {
      saved = await saveJournalDraft({
        journalEntryId,
        expectedVersion,
        entryType: parsedForm.entryType,
        eventOccurredAt: parsedForm.eventOccurredAt,
        healthContent: parsedForm.values.healthContent ?? "",
        educationOccupationContent:
          parsedForm.values.educationOccupationContent ?? "",
        emotionsBehaviorContent:
          parsedForm.values.emotionsBehaviorContent ?? "",
        socialRelationsContent: parsedForm.values.socialRelationsContent ?? "",
        dailyLivingIndependenceContent:
          parsedForm.values.dailyLivingIndependenceContent ?? "",
        otherContent: parsedForm.values.otherContent ?? "",
      });
    } else {
      const result = await createJournalDraft({
        clientId,
        entryType: parsedForm.entryType,
        eventOccurredAt: parsedForm.eventOccurredAt,
        healthContent: parsedForm.values.healthContent ?? "",
        educationOccupationContent:
          parsedForm.values.educationOccupationContent ?? "",
        emotionsBehaviorContent:
          parsedForm.values.emotionsBehaviorContent ?? "",
        socialRelationsContent: parsedForm.values.socialRelationsContent ?? "",
        dailyLivingIndependenceContent:
          parsedForm.values.dailyLivingIndependenceContent ?? "",
        otherContent: parsedForm.values.otherContent ?? "",
      });
      if (!result.created) {
        return {
          ...previousState,
          status: "STALE",
          message: STALE_DRAFT_MESSAGE,
          values: parsedForm.values,
          journalEntryId: undefined,
          version: undefined,
        };
      }
      saved = result.draft;
    }
  } catch (error) {
    return draftErrorState(previousState, parsedForm.values, error);
  }

  try {
    const goalResult = await replaceJournalDraftGoals({
      journalEntryId: saved.id,
      expectedVersion: saved.version,
      goalIds: [...parsedForm.values.goalIds],
    });
    saved = goalResult.draft;
  } catch {
    revalidatePath(`/klienter/${saved.clientId}/anteckningar`);
    revalidatePath(`/klienter/${saved.clientId}/anteckningar/utkast`);
    return {
      status: "PARTIAL",
      message: PARTIAL_GOAL_SAVE_MESSAGE,
      values: {
        ...parsedForm.values,
        goalIds: saved.goalReferences.map(({ goalId }) => goalId),
      },
      journalEntryId: saved.id,
      version: saved.version,
    };
  }

  revalidatePath(`/klienter/${saved.clientId}/anteckningar`);
  revalidatePath(`/klienter/${saved.clientId}/anteckningar/utkast`);
  if (submitIntent === "review") {
    redirect(`/klienter/${saved.clientId}/anteckningar/utkast/granska`);
  }
  return {
    status: "SUCCESS",
    message: "Utkastet har sparats.",
    values: parsedForm.values,
    journalEntryId: saved.id,
    version: saved.version,
  };
}

export async function discardJournalDraftAction(
  _previousState: JournalMutationActionState,
  formData: FormData,
): Promise<JournalMutationActionState> {
  const clientId = String(formData.get("clientId") ?? "");
  const journalEntryId = String(formData.get("journalEntryId") ?? "");
  const expectedVersion = Number(formData.get("expectedVersion"));
  let trustedClientId: string;

  try {
    const currentDraft = await getCurrentJournalDraft({ clientId });
    if (journalEntryId) {
      if (!currentDraft || currentDraft.id !== journalEntryId) {
        throw new JournalError("TARGET_UNAVAILABLE");
      }
      await discardJournalDraft({ journalEntryId, expectedVersion });
    }
    trustedClientId = currentDraft?.clientId ?? clientId;
  } catch (error) {
    if (error instanceof JournalError && error.code === "STALE_VERSION") {
      return { status: "CONFLICT", message: STALE_DRAFT_MESSAGE };
    }
    if (error instanceof JournalError && error.code === "TARGET_UNAVAILABLE") {
      return { status: "ERROR", message: LOST_ACCESS_MESSAGE };
    }
    return { status: "ERROR", message: GENERIC_ERROR };
  }

  revalidatePath(`/klienter/${trustedClientId}/anteckningar`);
  revalidatePath(`/klienter/${trustedClientId}/anteckningar/utkast`);
  redirect(`/klienter/${trustedClientId}/anteckningar?utkast=kastat`);
}

export async function signJournalDraftAction(
  previousState: JournalMutationActionState,
  formData: FormData,
): Promise<JournalMutationActionState> {
  let signed: JournalEntryRecord;
  try {
    signed = await signJournalDraft({
      operationId: String(formData.get("operationId") ?? ""),
      journalEntryId: String(formData.get("journalEntryId") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion")),
    });
  } catch (error) {
    if (
      error instanceof JournalError &&
      (error.code === "STALE_VERSION" || error.code === "SIGNING_CONFLICT")
    ) {
      return {
        ...previousState,
        status: "CONFLICT",
        message: SIGNING_CONFLICT_MESSAGE,
      };
    }
    if (error instanceof JournalError && error.code === "TARGET_UNAVAILABLE") {
      return {
        ...previousState,
        status: "ERROR",
        message: LOST_ACCESS_MESSAGE,
      };
    }
    return { ...previousState, status: "ERROR", message: GENERIC_ERROR };
  }

  revalidatePath(`/klienter/${signed.clientId}/anteckningar`);
  revalidatePath(`/klienter/${signed.clientId}/anteckningar/utkast`);
  revalidatePath(`/klienter/${signed.clientId}/anteckningar/${signed.id}`);
  redirect(
    `/klienter/${signed.clientId}/anteckningar/${signed.id}?signerad=klar`,
  );
}

export async function beginJournalCorrectionAction(
  previousState: JournalMutationActionState,
  formData: FormData,
): Promise<JournalMutationActionState> {
  let trustedClientId: string;
  try {
    const original = await getSignedJournalEntry({
      journalEntryId: String(formData.get("originalEntryId") ?? ""),
    });
    const result = await beginJournalCorrection({
      originalEntryId: original.id,
      entryType: original.entryType,
      eventOccurredAt: original.eventOccurredAt,
      healthContent: original.healthContent ?? "",
      educationOccupationContent: original.educationOccupationContent ?? "",
      emotionsBehaviorContent: original.emotionsBehaviorContent ?? "",
      socialRelationsContent: original.socialRelationsContent ?? "",
      dailyLivingIndependenceContent:
        original.dailyLivingIndependenceContent ?? "",
      otherContent:
        original.contentFormat === "LEGACY_NARRATIVE"
          ? original.content
          : (original.otherContent ?? ""),
    });
    trustedClientId = result.draft.clientId;
  } catch (error) {
    if (error instanceof JournalError && error.code === "OPEN_DRAFT_CONFLICT") {
      return {
        ...previousState,
        status: "CONFLICT",
        message: "Du har redan ett öppet utkast för den här klienten.",
      };
    }
    if (error instanceof JournalError && error.code === "TARGET_UNAVAILABLE") {
      return {
        ...previousState,
        status: "ERROR",
        message:
          "Rättelsen kunde inte skapas. Anteckningen kan inte längre rättas.",
      };
    }
    return { ...previousState, status: "ERROR", message: GENERIC_ERROR };
  }

  revalidatePath(`/klienter/${trustedClientId}/anteckningar`);
  redirect(`/klienter/${trustedClientId}/anteckningar/utkast`);
}
