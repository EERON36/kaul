import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  beginJournalCorrection: vi.fn(),
  createJournalDraft: vi.fn(),
  discardJournalDraft: vi.fn(),
  getCurrentJournalDraft: vi.fn(),
  getSignedJournalEntry: vi.fn(),
  replaceJournalDraftGoals: vi.fn(),
  saveJournalDraft: vi.fn(),
  signJournalDraft: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/journal/journal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/journal/journal")>()),
  beginJournalCorrection: mocks.beginJournalCorrection,
  createJournalDraft: mocks.createJournalDraft,
  discardJournalDraft: mocks.discardJournalDraft,
  getCurrentJournalDraft: mocks.getCurrentJournalDraft,
  getSignedJournalEntry: mocks.getSignedJournalEntry,
  replaceJournalDraftGoals: mocks.replaceJournalDraftGoals,
  saveJournalDraft: mocks.saveJournalDraft,
  signJournalDraft: mocks.signJournalDraft,
}));

import { JournalError } from "@/modules/journal/journal";

import {
  beginJournalCorrectionAction,
  discardJournalDraftAction,
  saveJournalDraftAction,
  signJournalDraftAction,
  type JournalDraftActionState,
  type JournalMutationActionState,
} from "./actions";

const clientId = "123e4567-e89b-42d3-a456-426614174001";
const entryId = "123e4567-e89b-42d3-a456-426614174002";
const operationId = "123e4567-e89b-42d3-a456-426614174003";
const goalId = "123e4567-e89b-42d3-a456-426614174004";
const previouslySavedGoalId = "123e4567-e89b-42d3-a456-426614174005";
const initialDraftState: JournalDraftActionState = {
  status: "IDLE",
  values: {
    entryType: "CONVERSATION",
    eventDate: "2026-08-12",
    eventTime: "08:15",
    content: "Tidigare innehåll.",
    goalIds: [],
  },
  journalEntryId: entryId,
  version: 1,
};
const initialMutationState: JournalMutationActionState = { status: "IDLE" };

function draftForm() {
  const form = new FormData();
  form.set("clientId", clientId);
  form.set("journalEntryId", entryId);
  form.set("expectedVersion", "1");
  form.set("entryType", "CONVERSATION");
  form.set("eventDate", "2026-08-12");
  form.set("eventTime", "08:15");
  form.set("content", "Webbläsarens osparade innehåll.");
  form.set("submitIntent", "save");
  form.append("goalIds", goalId);
  return form;
}

describe("Journal Server Action safe feedback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retains submitted values and never overwrites after a stale save", async () => {
    mocks.saveJournalDraft.mockRejectedValueOnce(
      new JournalError("STALE_VERSION"),
    );

    await expect(
      saveJournalDraftAction(initialDraftState, draftForm()),
    ).resolves.toMatchObject({
      status: "STALE",
      values: { content: "Webbläsarens osparade innehåll." },
      message: expect.stringContaining("Dina ändringar har inte sparats"),
    });
    expect(mocks.createJournalDraft).not.toHaveBeenCalled();
    expect(mocks.replaceJournalDraftGoals).not.toHaveBeenCalled();
  });

  it("updates Goal selection after saving and carries the returned version forward", async () => {
    mocks.saveJournalDraft.mockResolvedValueOnce({
      id: entryId,
      clientId,
      version: 2,
    });
    mocks.replaceJournalDraftGoals.mockResolvedValueOnce({
      changed: true,
      draft: { id: entryId, clientId, version: 3 },
    });

    const result = await saveJournalDraftAction(initialDraftState, draftForm());

    expect(mocks.replaceJournalDraftGoals).toHaveBeenCalledWith({
      journalEntryId: entryId,
      expectedVersion: 2,
      goalIds: [goalId],
    });
    expect(result).toMatchObject({
      status: "SUCCESS",
      version: 3,
      values: { goalIds: [goalId] },
    });
  });

  it("reports a durable content save separately when Goal selection fails", async () => {
    mocks.saveJournalDraft.mockResolvedValueOnce({
      id: entryId,
      clientId,
      version: 2,
      goalReferences: [{ goalId: previouslySavedGoalId, titleSnapshot: null }],
    });
    mocks.replaceJournalDraftGoals.mockRejectedValueOnce(
      new JournalError("STALE_VERSION"),
    );

    const result = await saveJournalDraftAction(initialDraftState, draftForm());

    expect(mocks.replaceJournalDraftGoals).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "PARTIAL",
      message:
        "Anteckningen sparades, men målkopplingarna kunde inte uppdateras. Ladda om utkastet och kontrollera målen innan du fortsätter.",
      values: {
        entryType: "CONVERSATION",
        eventDate: "2026-08-12",
        eventTime: "08:15",
        content: "Webbläsarens osparade innehåll.",
        goalIds: [previouslySavedGoalId],
      },
      journalEntryId: entryId,
      version: 2,
    });
    expect(mocks.revalidatePath.mock.calls).toEqual(
      expect.arrayContaining([
        [`/klienter/${clientId}/anteckningar`],
        [`/klienter/${clientId}/anteckningar/utkast`],
      ]),
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps Goal selection optional when saving a draft", async () => {
    const form = draftForm();
    form.delete("goalIds");
    mocks.saveJournalDraft.mockResolvedValueOnce({
      id: entryId,
      clientId,
      version: 2,
    });
    mocks.replaceJournalDraftGoals.mockResolvedValueOnce({
      changed: false,
      draft: { id: entryId, clientId, version: 2 },
    });

    await saveJournalDraftAction(initialDraftState, form);

    expect(mocks.replaceJournalDraftGoals).toHaveBeenCalledWith({
      journalEntryId: entryId,
      expectedVersion: 2,
      goalIds: [],
    });
  });

  it("withholds current revision credentials after an initial-create race", async () => {
    const initialCreateState: JournalDraftActionState = {
      status: "IDLE",
      values: initialDraftState.values,
    };
    const form = draftForm();
    form.delete("journalEntryId");
    form.delete("expectedVersion");
    mocks.createJournalDraft.mockResolvedValue({
      created: false,
      draft: { id: entryId, version: 4 },
    });

    const firstConflict = await saveJournalDraftAction(
      initialCreateState,
      form,
    );
    expect(firstConflict).toMatchObject({
      status: "STALE",
      values: { content: "Webbläsarens osparade innehåll." },
      journalEntryId: undefined,
      version: undefined,
    });

    form.set("submitIntent", "review");
    const repeatedConflict = await saveJournalDraftAction(firstConflict, form);
    expect(repeatedConflict).toMatchObject({
      status: "STALE",
      journalEntryId: undefined,
      version: undefined,
    });
    expect(mocks.createJournalDraft).toHaveBeenCalledTimes(2);
    expect(mocks.saveJournalDraft).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not disclose or discard a foreign draft through a direct action", async () => {
    mocks.getCurrentJournalDraft.mockResolvedValueOnce(null);
    const form = new FormData();
    form.set("clientId", clientId);
    form.set("journalEntryId", entryId);
    form.set("expectedVersion", "1");

    const result = await discardJournalDraftAction(initialMutationState, form);

    expect(result).toEqual({
      status: "ERROR",
      message:
        "Du har inte längre behörighet till klienten. Ändringarna har inte sparats.",
    });
    expect(mocks.discardJournalDraft).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("another");
  });

  it("maps repeated signing to the approved safe conflict message", async () => {
    mocks.signJournalDraft.mockRejectedValueOnce(
      new JournalError("SIGNING_CONFLICT"),
    );
    const form = new FormData();
    form.set("operationId", operationId);
    form.set("journalEntryId", entryId);
    form.set("expectedVersion", "2");

    await expect(
      signJournalDraftAction({ status: "IDLE", operationId }, form),
    ).resolves.toMatchObject({
      status: "CONFLICT",
      message:
        "Anteckningen kunde inte signeras eftersom den har ändrats eller redan signerats. Ladda om och granska igen.",
    });
  });

  it("reports only the current actor's own open-draft conflict", async () => {
    mocks.getSignedJournalEntry.mockResolvedValueOnce({
      id: entryId,
      entryType: "CONVERSATION",
      eventOccurredAt: new Date("2026-08-12T06:15:00Z"),
      content: "Fiktivt original.",
    });
    mocks.beginJournalCorrection.mockRejectedValueOnce(
      new JournalError("OPEN_DRAFT_CONFLICT"),
    );
    const form = new FormData();
    form.set("originalEntryId", entryId);

    await expect(
      beginJournalCorrectionAction(initialMutationState, form),
    ).resolves.toEqual({
      status: "CONFLICT",
      message: "Du har redan ett öppet utkast för den här klienten.",
    });
  });
});
