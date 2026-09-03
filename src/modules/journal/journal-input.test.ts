import { describe, expect, it } from "vitest";

import {
  createJournalDraftInputSchema,
  saveJournalDraftInputSchema,
} from "./journal-input";
import {
  JOURNAL_ENTRY_TYPE_LABELS,
  JOURNAL_ENTRY_TYPE_VALUES,
} from "./journal-entry-type";

const clientId = "123e4567-e89b-42d3-a456-426614174000";
const eventOccurredAt = "2026-08-12T08:15:00+02:00";

describe("journal entry vocabulary and input", () => {
  it("preserves the exact authoritative type vocabulary and Swedish labels", () => {
    expect(JOURNAL_ENTRY_TYPE_VALUES).toEqual([
      "DAILY_NOTE",
      "CONVERSATION",
      "PHONE_CALL",
      "MEETING",
      "HOME_VISIT",
      "SCHOOL_CONTACT",
      "OBSERVATION",
      "OTHER",
    ]);
    expect(JOURNAL_ENTRY_TYPE_LABELS).toEqual({
      DAILY_NOTE: "Daganteckning",
      CONVERSATION: "Samtal",
      PHONE_CALL: "Telefonsamtal",
      MEETING: "Möte",
      HOME_VISIT: "Hembesök",
      SCHOOL_CONTACT: "Skolkontakt",
      OBSERVATION: "Observation",
      OTHER: "Övrigt",
    });
  });

  it("validates six structured sections, type, event time and optimistic version", () => {
    expect(
      createJournalDraftInputSchema.parse({
        clientId,
        entryType: "CONVERSATION",
        eventOccurredAt,
        healthContent: "  Rad ett.\n\nRad två.  ",
        educationOccupationContent: "",
        emotionsBehaviorContent: "",
        socialRelationsContent: "",
        dailyLivingIndependenceContent: "",
        otherContent: "",
      }),
    ).toMatchObject({
      clientId,
      entryType: "CONVERSATION",
      healthContent: "  Rad ett.\n\nRad två.  ",
      eventOccurredAt: new Date(eventOccurredAt),
    });

    for (const entryType of ["INCIDENT", "CUSTOM", ""] as const) {
      expect(
        createJournalDraftInputSchema.safeParse({
          clientId,
          entryType,
          eventOccurredAt,
          healthContent: "Fiktiv anteckning",
          educationOccupationContent: "",
          emotionsBehaviorContent: "",
          socialRelationsContent: "",
          dailyLivingIndependenceContent: "",
          otherContent: "",
        }).success,
      ).toBe(false);
    }
    expect(
      createJournalDraftInputSchema.safeParse({
        clientId,
        entryType: "OTHER",
        eventOccurredAt,
        healthContent: "",
        educationOccupationContent: "",
        emotionsBehaviorContent: "",
        socialRelationsContent: "",
        dailyLivingIndependenceContent: "",
        otherContent: "  \n  ",
      }).success,
    ).toBe(false);
    expect(
      saveJournalDraftInputSchema.safeParse({
        journalEntryId: clientId,
        expectedVersion: 0,
        entryType: "OTHER",
        eventOccurredAt,
        healthContent: "Fiktiv anteckning",
        educationOccupationContent: "",
        emotionsBehaviorContent: "",
        socialRelationsContent: "",
        dailyLivingIndependenceContent: "",
        otherContent: "",
      }).success,
    ).toBe(false);
  });

  it("rejects crafted legacy narrative creation payloads", () => {
    expect(
      createJournalDraftInputSchema.safeParse({
        clientId,
        entryType: "CONVERSATION",
        eventOccurredAt,
        content: "Ny ospecificerad narrativ anteckning",
      }).success,
    ).toBe(false);
  });
});
