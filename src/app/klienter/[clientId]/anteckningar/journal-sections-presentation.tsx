import {
  JOURNAL_SECTION_FIELDS,
  parseJournalSections,
} from "./journal-sections";

export function JournalSectionsPresentation({
  content,
}: Readonly<{ content: string }>) {
  const sections = parseJournalSections(content);
  if (!sections) {
    return <div className="journal-content">{content}</div>;
  }

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
