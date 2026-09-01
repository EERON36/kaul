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
