import {
  createElement,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NavigationGuardProvider } from "@/components/navigation-guard";

vi.mock("./actions", () => ({
  discardJournalDraftAction: vi.fn(),
  saveJournalDraftAction: vi.fn(),
}));

import { JournalDraftForm } from "./journal-draft-form-client";

const clientId = "123e4567-e89b-42d3-a456-426614174001";
const journalEntryId = "123e4567-e89b-42d3-a456-426614174002";
const durableGoalId = "123e4567-e89b-42d3-a456-426614174003";
const requestedGoalId = "123e4567-e89b-42d3-a456-426614174004";
const TestNavigationGuardProvider = NavigationGuardProvider as ComponentType<
  PropsWithChildren<{ confirmationMessage: string }>
>;

describe("Journal draft partial-save recovery", () => {
  it("offers reload and renders only the durable Goal selection", () => {
    const html = renderToStaticMarkup(
      createElement(
        TestNavigationGuardProvider,
        { confirmationMessage: "Fiktiv varning." },
        createElement(JournalDraftForm, {
          clientId,
          initialState: {
            status: "PARTIAL",
            message:
              "Anteckningen sparades, men målkopplingarna kunde inte uppdateras. Ladda om utkastet och kontrollera målen innan du fortsätter.",
            values: {
              entryType: "CONVERSATION",
              eventDate: "2026-08-12",
              eventTime: "08:15",
              content: "Det hållbara innehållet.",
              goalIds: [durableGoalId],
            },
            journalEntryId,
            version: 2,
          },
          goals: [
            {
              id: durableGoalId,
              title: "Tidigare hållbart mål",
              status: "ACTIVE",
            },
            {
              id: requestedGoalId,
              title: "Ej sparat målval",
              status: "ACTIVE",
            },
          ],
        }),
      ),
    );

    expect(html).toContain(
      "Anteckningen sparades, men målkopplingarna kunde inte uppdateras.",
    );
    expect(html).toContain(`href="/klienter/${clientId}/anteckningar/utkast"`);
    const versionInput = html.match(
      /<input[^>]*name="expectedVersion"[^>]*>/,
    )?.[0];
    expect(versionInput).toContain('value="2"');

    const durableGoalInput = html.match(
      new RegExp(`<input[^>]*value="${durableGoalId}"[^>]*>`),
    )?.[0];
    const requestedGoalInput = html.match(
      new RegExp(`<input[^>]*value="${requestedGoalId}"[^>]*>`),
    )?.[0];
    expect(durableGoalInput).toContain('checked=""');
    expect(requestedGoalInput).not.toContain('checked=""');
  });
});
