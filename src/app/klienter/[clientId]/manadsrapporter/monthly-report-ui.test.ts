import {
  createElement,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveMonthlyReportDraft: vi.fn(),
  signMonthlyReportDraft: vi.fn(),
}));

vi.mock("@/modules/reports/monthly-reports", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/reports/monthly-reports")
  >()),
  saveMonthlyReportDraft: mocks.saveMonthlyReportDraft,
  signMonthlyReportDraft: mocks.signMonthlyReportDraft,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/modules/audit/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/audit/audit")>()),
  generateAuditOperationId: () => "123e4567-e89b-42d3-a456-426614174000",
}));

import { MonthlyReportError } from "@/modules/reports/monthly-reports";

import {
  saveMonthlyReportDraftAction,
  signMonthlyReportDraftAction,
  type MonthlyReportActionState,
} from "./actions";
import { MonthlyReportDraftForm } from "./monthly-report-draft-form-client";
import { MonthlyReportSectionsPresentation } from "./report-sections-presentation";
import { formatMonthlyReportMonth } from "./report-presentation";
import { NavigationGuardProvider } from "@/components/navigation-guard";
import { ClientWorkspaceHeader } from "../client-workspace";

const TestNavigationGuardProvider = NavigationGuardProvider as ComponentType<
  PropsWithChildren<{ confirmationMessage: string }>
>;

const reportId = "123e4567-e89b-42d3-a456-426614174001";
const initialState: MonthlyReportActionState = {
  status: "IDLE",
  values: {
    healthContent: "",
    educationOccupationContent: "",
    emotionsBehaviorContent: "",
    socialRelationsContent: "",
    dailyLivingIndependenceContent: "",
    otherContent: "",
  },
  monthlyReportId: reportId,
  version: 1,
};

function reportForm() {
  const form = new FormData();
  form.set("monthlyReportId", reportId);
  form.set("expectedVersion", "1");
  form.set("healthContent", "Fiktiv hälsouppgift.");
  form.set("educationOccupationContent", "");
  form.set("emotionsBehaviorContent", "");
  form.set("socialRelationsContent", "");
  form.set("dailyLivingIndependenceContent", "");
  form.set("otherContent", "");
  form.set("submitIntent", "save");
  return form;
}

describe("Monthly report UI and action boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders all six editable sections with no individual required field", () => {
    const html = renderToStaticMarkup(
      createElement(
        TestNavigationGuardProvider,
        { confirmationMessage: "Fiktiv varning." },
        createElement(MonthlyReportDraftForm, {
          clientId: "123e4567-e89b-42d3-a456-426614174002",
          initialState,
        }),
      ),
    );
    for (const field of [
      "healthContent",
      "educationOccupationContent",
      "emotionsBehaviorContent",
      "socialRelationsContent",
      "dailyLivingIndependenceContent",
      "otherContent",
    ]) {
      expect(html).toContain(`name="${field}"`);
    }
    expect(html).not.toContain('name="healthContent" required');
  });

  it("returns a Swedish conflict while retaining all submitted sections", async () => {
    mocks.saveMonthlyReportDraft.mockRejectedValueOnce(
      new MonthlyReportError("STALE_VERSION"),
    );
    const result = await saveMonthlyReportDraftAction(
      initialState,
      reportForm(),
    );
    expect(result).toMatchObject({
      status: "CONFLICT",
      values: { healthContent: "Fiktiv hälsouppgift." },
      message: expect.stringContaining("annan session"),
    });
  });

  it("does not allow an empty report to sign", async () => {
    mocks.signMonthlyReportDraft.mockRejectedValueOnce(
      new MonthlyReportError("CONTENT_REQUIRED"),
    );
    const result = await signMonthlyReportDraftAction(
      { status: "IDLE", operationId: "123e4567-e89b-42d3-a456-426614174003" },
      new FormData(),
    );
    expect(result).toMatchObject({
      status: "ERROR",
      message: expect.stringContaining("minst en del"),
    });
  });

  it("formats Swedish month and presents all signed sections", () => {
    expect(formatMonthlyReportMonth(2026, 8)).toBe("Augusti 2026");
    const html = renderToStaticMarkup(
      createElement(MonthlyReportSectionsPresentation, {
        sections: {
          healthContent: "Fiktiv hälsa.",
          educationOccupationContent: null,
          emotionsBehaviorContent: null,
          socialRelationsContent: null,
          dailyLivingIndependenceContent: null,
          otherContent: "Fiktivt övrigt.",
        },
      }),
    );
    expect(html).toContain("Hälsa");
    expect(html).toContain("ADL/självständighet");
    expect(html).toContain("Ingen uppgift angiven.");
  });

  it("adds the monthly report workspace navigation item", () => {
    const html = renderToStaticMarkup(
      createElement(ClientWorkspaceHeader, {
        client: {
          id: "123e4567-e89b-42d3-a456-426614174002",
          firstName: "Fiktiv",
          lastName: "Klient",
          personIdentifier: "REF-01",
          category: "ADULT",
          status: "ACTIVE",
          archivedAt: null,
        },
        currentSection: "monthly-reports",
      }),
    );
    expect(html).toContain("Månadsrapporter");
    expect(html).toContain(
      'aria-current="page" href="/klienter/123e4567-e89b-42d3-a456-426614174002/manadsrapporter"',
    );
  });
});
