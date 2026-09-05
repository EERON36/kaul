import { STRUCTURED_SECTION_DEFINITIONS } from "@/lib/structured-sections";

export function MonthlyReportSectionsPresentation({
  sections,
}: Readonly<{
  sections: Readonly<
    Record<
      (typeof STRUCTURED_SECTION_DEFINITIONS)[number]["key"],
      string | null
    >
  >;
}>) {
  return (
    <div className="journal-section-list">
      {STRUCTURED_SECTION_DEFINITIONS.map(({ key, label }) => (
        <section className="journal-content-subsection" key={key}>
          <h3>{label}</h3>
          <div className="journal-content">
            {sections[key] || "Ingen uppgift angiven."}
          </div>
        </section>
      ))}
    </div>
  );
}
