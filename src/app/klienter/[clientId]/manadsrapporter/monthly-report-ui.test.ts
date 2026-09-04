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
import { saveMonthlyReportDraftInputSchema } from "@/modules/reports/monthly-report-input";
import {
  STRUCTURED_CONTENT_MAX_LENGTH,
  STRUCTURED_SECTION_DEFINITIONS,
} from "@/lib/structured-sections";

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
  beforeEach(() => vi.resetAllMocks());

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

  it("explains the combined section limit and preserves the submitted draft", async () => {
    mocks.saveMonthlyReportDraft.mockImplementationOnce(async (input) => {
      saveMonthlyReportDraftInputSchema.parse(input);
      throw new Error("An oversized report must fail validation.");
    });
    const form = reportForm();
    form.set("healthContent", "H".repeat(60_000));
    form.set("otherContent", "O".repeat(60_000));
    form.set("educationOccupationContent", "Fiktiv utbildning.");
    form.set("emotionsBehaviorContent", "Fiktiva känslor.");
    form.set("socialRelationsContent", "Fiktiva relationer.");
    form.set("dailyLivingIndependenceContent", "Fiktiv självständighet.");
    const result = await saveMonthlyReportDraftAction(initialState, form);
    const contentError =
      "Månadsrapportens delar får sammanlagt innehålla högst 100 000 tecken.";

    expect(result.status).toBe("ERROR");
    expect(result.message).toBe("Kontrollera uppgifterna i formuläret.");
    expect(result.fieldErrors).toEqual({ otherContent: contentError });
    expect(result.monthlyReportId).toBe(reportId);
    expect(result.version).toBe(1);
    for (const { key } of STRUCTURED_SECTION_DEFINITIONS) {
      expect(result.values[key]).toBe(form.get(key));
    }

    const html = renderToStaticMarkup(
      createElement(
        TestNavigationGuardProvider,
        { confirmationMessage: "Fiktiv varning." },
        createElement(MonthlyReportDraftForm, {
          clientId: "123e4567-e89b-42d3-a456-426614174002",
          initialState: result,
        }),
      ),
    );
    expect(html).toContain(
      '<fieldset aria-describedby="monthly-report-content-error"',
    );
    expect(html).toContain(
      `id="monthly-report-content-error">${contentError}</p>`,
    );
    for (const { key } of STRUCTURED_SECTION_DEFINITIONS) {
      expect(html).toContain(result.values[key]);
    }
  });

  it("accepts the exact combined limit and clears an earlier length error", async () => {
    const form = reportForm();
    form.set("healthContent", "H".repeat(STRUCTURED_CONTENT_MAX_LENGTH / 2));
    form.set("otherContent", "O".repeat(STRUCTURED_CONTENT_MAX_LENGTH / 2));
    mocks.saveMonthlyReportDraft.mockImplementationOnce(async (input) => {
      saveMonthlyReportDraftInputSchema.parse(input);
      return { id: reportId, clientId: "fictional-client", version: 2 };
    });
    const result = await saveMonthlyReportDraftAction(
      {
        ...initialState,
        status: "ERROR",
        fieldErrors: { otherContent: "Tidigare längdfel." },
      },
      form,
    );
    expect(result.status).toBe("SUCCESS");
    expect(result.version).toBe(2);
    expect(result.fieldErrors).toBeUndefined();
    expect(mocks.saveMonthlyReportDraft).toHaveBeenCalledOnce();
  });

  it("clears an earlier length error when corrected input encounters a conflict", async () => {
    mocks.saveMonthlyReportDraft.mockRejectedValueOnce(
      new MonthlyReportError("STALE_VERSION"),
    );
    const result = await saveMonthlyReportDraftAction(
      {
        ...initialState,
        status: "ERROR",
        fieldErrors: { otherContent: "Tidigare längdfel." },
      },
      reportForm(),
    );
    expect(result.status).toBe("CONFLICT");
    expect(result.fieldErrors).toBeUndefined();
    expect(result.values.healthContent).toBe("Fiktiv hälsouppgift.");
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
