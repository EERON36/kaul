export const JOURNAL_SECTION_FIELDS = [
  { key: "healthContent", label: "Hälsa", id: "journal-health-content" },
  {
    key: "educationOccupationContent",
    label: "Utbildning/Sysselsättning",
    id: "journal-education-occupation-content",
  },
  {
    key: "emotionsBehaviorContent",
    label: "Känslor och Beteende",
    id: "journal-emotions-behavior-content",
  },
  {
    key: "socialRelationsContent",
    label: "Sociala relationer",
    id: "journal-social-relations-content",
  },
  {
    key: "dailyLivingIndependenceContent",
    label: "ADL/självständighet",
    id: "journal-daily-living-independence-content",
  },
  { key: "otherContent", label: "Övrigt", id: "journal-other-content" },
] as const;

export type JournalSectionFieldKey =
  (typeof JOURNAL_SECTION_FIELDS)[number]["key"];

export type JournalSectionValues = Readonly<
  Record<JournalSectionFieldKey, string>
>;

type MutableJournalSectionValues = Record<JournalSectionFieldKey, string>;

const STRUCTURED_CONTENT_MARKER = "KAUL_STRUCTURED_JOURNAL_V1";

export function emptyJournalSectionValues(): JournalSectionValues {
  return {
    healthContent: "",
    educationOccupationContent: "",
    emotionsBehaviorContent: "",
    socialRelationsContent: "",
    dailyLivingIndependenceContent: "",
    otherContent: "",
  };
}

export function serializeJournalSections(values: JournalSectionValues): string {
  return `${STRUCTURED_CONTENT_MARKER}\n${JSON.stringify(values)}`;
}

export function parseJournalSections(
  content: string,
): JournalSectionValues | null {
  const lines = content.split("\n");
  if (lines[0] !== STRUCTURED_CONTENT_MARKER) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(lines.slice(1).join("\n"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const values: MutableJournalSectionValues = {
    ...emptyJournalSectionValues(),
  };
  for (const { key } of JOURNAL_SECTION_FIELDS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value !== "string") return null;
    values[key] = value;
  }
  return values;
}
