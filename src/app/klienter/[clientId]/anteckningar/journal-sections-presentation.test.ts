import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JournalSectionsPresentation } from "./journal-sections-presentation";

describe("Journal structured presentation", () => {
  it("shows every section, including sections without content", () => {
    const html = renderToStaticMarkup(
      createElement(JournalSectionsPresentation, {
        contentFormat: "STRUCTURED_V1",
        content: "",
        healthContent: "Fiktiv hälsouppgift.",
        educationOccupationContent: "",
        emotionsBehaviorContent: "Fiktivt beteende.",
        socialRelationsContent: "",
        dailyLivingIndependenceContent: "",
        otherContent: "Fiktiv övrig uppgift.",
      }),
    );

    for (const label of [
      "Hälsa",
      "Utbildning/Sysselsättning",
      "Känslor och Beteende",
      "Sociala relationer",
      "ADL/självständighet",
      "Övrigt",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Ingen uppgift angiven.");
    expect(html).toContain("Fiktiv hälsouppgift.");
  });

  it("keeps legacy narrative content readable", () => {
    const html = renderToStaticMarkup(
      createElement(JournalSectionsPresentation, {
        contentFormat: "LEGACY_NARRATIVE",
        content: "Äldre signerad anteckning.",
        healthContent: null,
        educationOccupationContent: null,
        emotionsBehaviorContent: null,
        socialRelationsContent: null,
        dailyLivingIndependenceContent: null,
        otherContent: null,
      }),
    );

    expect(html).toContain("Äldre signerad anteckning.");
    expect(html).not.toContain("Ingen uppgift angiven.");
  });
});
