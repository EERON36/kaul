import { JOURNAL_SECTION_FIELDS } from "./journal-sections";

export function JournalSectionsPresentation({
  contentFormat,
  content,
  healthContent,
  educationOccupationContent,
  emotionsBehaviorContent,
  socialRelationsContent,
  dailyLivingIndependenceContent,
  otherContent,
}: Readonly<{
  contentFormat: "LEGACY_NARRATIVE" | "STRUCTURED_V1";
  content: string;
  healthContent: string | null;
  educationOccupationContent: string | null;
  emotionsBehaviorContent: string | null;
  socialRelationsContent: string | null;
  dailyLivingIndependenceContent: string | null;
  otherContent: string | null;
}>) {
  if (contentFormat === "LEGACY_NARRATIVE") {
    return <div className="journal-content">{content}</div>;
  }

  const sections = {
    healthContent,
    educationOccupationContent,
    emotionsBehaviorContent,
    socialRelationsContent,
    dailyLivingIndependenceContent,
    otherContent,
  };

  return (
    <div className="journal-section-list">
      {JOURNAL_SECTION_FIELDS.map(({ key, label }) => (
        <section className="journal-content-subsection" key={key}>
          <h4>{label}</h4>
          <div className="journal-content">
            {sections[key] || "Ingen uppgift angiven."}
          </div>
        </section>
      ))}
    </div>
  );
}
