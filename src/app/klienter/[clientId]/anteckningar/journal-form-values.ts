import {
  JOURNAL_CONTENT_MAX_LENGTH,
  JOURNAL_ENTRY_TYPE_VALUES,
} from "@/modules/journal/journal-entry-type";

import {
  emptyJournalSectionValues,
  JOURNAL_SECTION_FIELDS,
  type JournalSectionFieldKey,
  type JournalSectionValues,
} from "./journal-sections";

export type JournalFormValues = Readonly<{
  entryType: string;
  eventDate: string;
  eventTime: string;
  content: string;
  goalIds: readonly string[];
  healthContent?: string;
  educationOccupationContent?: string;
  emotionsBehaviorContent?: string;
  socialRelationsContent?: string;
  dailyLivingIndependenceContent?: string;
  otherContent?: string;
}>;

export type JournalFormFieldErrors = Partial<
  Record<keyof JournalFormValues, string>
>;

export type JournalEntryTypeValue = (typeof JOURNAL_ENTRY_TYPE_VALUES)[number];

export function areJournalFormValuesEqual(
  first: JournalFormValues,
  second: JournalFormValues,
) {
  return (
    first.entryType === second.entryType &&
    first.eventDate === second.eventDate &&
    first.eventTime === second.eventTime &&
    getSectionValue(first, "healthContent") ===
      getSectionValue(second, "healthContent") &&
    getSectionValue(first, "educationOccupationContent") ===
      getSectionValue(second, "educationOccupationContent") &&
    getSectionValue(first, "emotionsBehaviorContent") ===
      getSectionValue(second, "emotionsBehaviorContent") &&
    getSectionValue(first, "socialRelationsContent") ===
      getSectionValue(second, "socialRelationsContent") &&
    getSectionValue(first, "dailyLivingIndependenceContent") ===
      getSectionValue(second, "dailyLivingIndependenceContent") &&
    getSectionValue(first, "otherContent") ===
      getSectionValue(second, "otherContent") &&
    [...first.goalIds].sort().join("\u0000") ===
      [...second.goalIds].sort().join("\u0000")
  );
}

function getSectionValue(
  values: JournalFormValues,
  key: JournalSectionFieldKey,
): string {
  if (values[key] !== undefined) return values[key];
  return key === "otherContent" ? values.content : "";
}

function readJournalSections(formData: FormData): JournalSectionValues {
  const values = { ...emptyJournalSectionValues() };
  for (const { key } of JOURNAL_SECTION_FIELDS) {
    values[key] = String(formData.get(key) ?? "");
  }
  return values;
}

const stockholmDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getStockholmParts(date: Date) {
  const parts = Object.fromEntries(
    stockholmDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function formatJournalFormDateTime(date: Date): Readonly<{
  eventDate: string;
  eventTime: string;
}> {
  const parts = getStockholmParts(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    eventDate: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    eventTime: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

function parseLocalParts(eventDate: string, eventTime: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(eventTime);
  if (!dateMatch || !timeMatch) return null;

  const parts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  };
  const check = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );
  if (
    check.getUTCFullYear() !== parts.year ||
    check.getUTCMonth() + 1 !== parts.month ||
    check.getUTCDate() !== parts.day ||
    check.getUTCHours() !== parts.hour ||
    check.getUTCMinutes() !== parts.minute
  ) {
    return null;
  }
  return parts;
}

export function parseStockholmEventDateTime(
  eventDate: string,
  eventTime: string,
): Date | null {
  const expected = parseLocalParts(eventDate, eventTime);
  if (!expected) return null;

  const localAsUtc = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
  );
  const matches: Date[] = [];

  // Resolve the browser's timezone-free date and time against the approved
  // operational timezone. The search also rejects skipped DST wall times.
  for (
    let offsetMinutes = -14 * 60;
    offsetMinutes <= 14 * 60;
    offsetMinutes += 15
  ) {
    const candidate = new Date(localAsUtc - offsetMinutes * 60_000);
    const actual = getStockholmParts(candidate);
    if (
      actual.year === expected.year &&
      actual.month === expected.month &&
      actual.day === expected.day &&
      actual.hour === expected.hour &&
      actual.minute === expected.minute
    ) {
      matches.push(candidate);
    }
  }

  // A repeated autumn wall time maps to two instants and must not be guessed.
  return matches.length === 1 ? matches[0] : null;
}

export function readJournalFormValues(formData: FormData): Readonly<{
  values: JournalFormValues;
  fieldErrors: JournalFormFieldErrors;
  eventOccurredAt: Date | null;
  entryType: JournalEntryTypeValue | null;
}> {
  const sections = readJournalSections(formData);
  const submittedContent = String(formData.get("content") ?? "");
  const hasStructuredFields = JOURNAL_SECTION_FIELDS.some(({ key }) =>
    formData.has(key),
  );
  const values: JournalFormValues = {
    entryType: String(formData.get("entryType") ?? ""),
    eventDate: String(formData.get("eventDate") ?? ""),
    eventTime: String(formData.get("eventTime") ?? ""),
    content: submittedContent,
    goalIds: formData.getAll("goalIds").map(String),
    ...sections,
  };
  const fieldErrors: JournalFormFieldErrors = {};

  const entryType = JOURNAL_ENTRY_TYPE_VALUES.includes(
    values.entryType as JournalEntryTypeValue,
  )
    ? (values.entryType as JournalEntryTypeValue)
    : null;
  if (!entryType) {
    fieldErrors.entryType = "Välj en giltig typ av anteckning.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.eventDate)) {
    fieldErrors.eventDate = "Ange ett giltigt datum.";
  }
  if (!/^\d{2}:\d{2}$/.test(values.eventTime)) {
    fieldErrors.eventTime = "Ange en giltig tid.";
  }
  const eventOccurredAt = parseStockholmEventDateTime(
    values.eventDate,
    values.eventTime,
  );
  if (!eventOccurredAt && !fieldErrors.eventDate && !fieldErrors.eventTime) {
    fieldErrors.eventTime =
      "Tiden kan inte tolkas entydigt i svensk lokal tid. Kontrollera eller välj en annan tid.";
  }
  const structuredLength = Object.values(sections).reduce(
    (total, value) => total + value.length,
    0,
  );
  const hasMeaningfulContent = hasStructuredFields
    ? Object.values(sections).some((value) => value.trim().length > 0)
    : values.content.trim().length > 0;
  if (!hasMeaningfulContent) {
    fieldErrors.content = "Skriv en anteckning.";
  } else if (
    hasStructuredFields
      ? structuredLength > JOURNAL_CONTENT_MAX_LENGTH
      : values.content.length > JOURNAL_CONTENT_MAX_LENGTH
  ) {
    fieldErrors.content = `Anteckningen får innehålla högst ${JOURNAL_CONTENT_MAX_LENGTH.toLocaleString("sv-SE")} tecken.`;
  }
  if (
    values.goalIds.some(
      (goalId) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          goalId,
        ),
    ) ||
    new Set(values.goalIds).size !== values.goalIds.length ||
    values.goalIds.length > 100
  ) {
    fieldErrors.goalIds = "Välj giltiga mål för klienten.";
  }

  return { values, fieldErrors, eventOccurredAt, entryType };
}
