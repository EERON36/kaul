import "server-only";

import { requireApplicationUser } from "../authentication/guards";
import {
  beginJournalCorrectionInternal,
  createJournalDraftInternal,
  discardJournalDraftInternal,
  getCurrentJournalDraftInternal,
  getSignedJournalEntryInternal,
  JournalError,
  listSignedJournalEntriesInternal,
  saveJournalDraftInternal,
  signJournalDraftInternal,
  type JournalEntryRecord,
  type SignedJournalEntryDetail,
} from "./journal-internal";
import type {
  BeginJournalCorrectionInput,
  ClientJournalQueryInput,
  CreateJournalDraftInput,
  DiscardJournalDraftInput,
  JournalEntryQueryInput,
  SaveJournalDraftInput,
  SignJournalDraftInput,
} from "./journal-input";

export {
  JOURNAL_ENTRY_TYPE_LABELS,
  JOURNAL_ENTRY_TYPE_VALUES,
} from "./journal-entry-type";
export {
  JOURNAL_CONTENT_MAX_LENGTH,
  type BeginJournalCorrectionInput,
  type ClientJournalQueryInput,
  type CreateJournalDraftInput,
  type DiscardJournalDraftInput,
  type JournalEntryQueryInput,
  type SaveJournalDraftInput,
  type SignJournalDraftInput,
} from "./journal-input";
export { JournalError, type JournalEntryRecord, type SignedJournalEntryDetail };

export async function getCurrentJournalDraft(
  input: ClientJournalQueryInput,
): Promise<JournalEntryRecord | null> {
  return getCurrentJournalDraftInternal(input, await requireApplicationUser());
}

export async function createJournalDraft(input: CreateJournalDraftInput) {
  return createJournalDraftInternal(input, await requireApplicationUser());
}

export async function saveJournalDraft(input: SaveJournalDraftInput) {
  return saveJournalDraftInternal(input, await requireApplicationUser());
}

export async function discardJournalDraft(
  input: DiscardJournalDraftInput,
): Promise<void> {
  return discardJournalDraftInternal(input, await requireApplicationUser());
}

export async function signJournalDraft(input: SignJournalDraftInput) {
  return signJournalDraftInternal(input, await requireApplicationUser());
}

export async function listSignedJournalEntries(
  input: ClientJournalQueryInput,
): Promise<readonly JournalEntryRecord[]> {
  return listSignedJournalEntriesInternal(
    input,
    await requireApplicationUser(),
  );
}

export async function getSignedJournalEntry(
  input: JournalEntryQueryInput,
): Promise<SignedJournalEntryDetail> {
  return getSignedJournalEntryInternal(input, await requireApplicationUser());
}

export async function beginJournalCorrection(
  input: BeginJournalCorrectionInput,
) {
  return beginJournalCorrectionInternal(input, await requireApplicationUser());
}
