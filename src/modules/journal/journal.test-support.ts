import type { ApplicationUser } from "../authentication/guards";
import {
  beginJournalCorrectionInternal,
  createJournalDraftInternal,
  discardJournalDraftInternal,
  getCurrentJournalDraftInternal,
  getSignedJournalEntryInternal,
  listSignedJournalEntriesInternal,
  saveJournalDraftInternal,
  signJournalDraftInternal,
  verifySigningTransactionCompletionForTest as verifySigningTransactionCompletionInternalForTest,
  type JournalTestDependencies,
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
import type { AuditIntentHandle } from "../audit/audit";

function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Journal test support is available only in tests.");
  }
}

export function getCurrentJournalDraftForTest(
  input: ClientJournalQueryInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return getCurrentJournalDraftInternal(input, actor);
}

export function createJournalDraftForTest(
  input: CreateJournalDraftInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return createJournalDraftInternal(input, actor);
}

export function saveJournalDraftForTest(
  input: SaveJournalDraftInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return saveJournalDraftInternal(input, actor);
}

export function discardJournalDraftForTest(
  input: DiscardJournalDraftInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return discardJournalDraftInternal(input, actor);
}

export function signJournalDraftForTest(
  input: SignJournalDraftInput,
  actor: ApplicationUser,
  dependencies: JournalTestDependencies = {},
) {
  assertTestEnvironment();
  return signJournalDraftInternal(input, actor, dependencies);
}

export function verifySigningTransactionCompletionForTest(
  intent: AuditIntentHandle,
  actor: ApplicationUser,
  clientId: string,
  journalEntryId: string,
  expectedVersion: number,
) {
  assertTestEnvironment();
  return verifySigningTransactionCompletionInternalForTest(
    intent,
    actor,
    clientId,
    journalEntryId,
    expectedVersion,
  );
}

export function listSignedJournalEntriesForTest(
  input: ClientJournalQueryInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return listSignedJournalEntriesInternal(input, actor);
}

export function getSignedJournalEntryForTest(
  input: JournalEntryQueryInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return getSignedJournalEntryInternal(input, actor);
}

export function beginJournalCorrectionForTest(
  input: BeginJournalCorrectionInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return beginJournalCorrectionInternal(input, actor);
}
