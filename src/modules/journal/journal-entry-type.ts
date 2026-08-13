import type { JournalEntryType } from "../../generated/prisma/enums";

export const JOURNAL_ENTRY_TYPE_VALUES = [
  "DAILY_NOTE",
  "CONVERSATION",
  "PHONE_CALL",
  "MEETING",
  "HOME_VISIT",
  "SCHOOL_CONTACT",
  "OBSERVATION",
  "OTHER",
] as const satisfies readonly JournalEntryType[];

export const JOURNAL_ENTRY_TYPE_LABELS = {
  DAILY_NOTE: "Daganteckning",
  CONVERSATION: "Samtal",
  PHONE_CALL: "Telefonsamtal",
  MEETING: "Möte",
  HOME_VISIT: "Hembesök",
  SCHOOL_CONTACT: "Skolkontakt",
  OBSERVATION: "Observation",
  OTHER: "Övrigt",
} as const satisfies Readonly<Record<JournalEntryType, string>>;
