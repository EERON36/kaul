import { describe, expect, it } from "vitest";

import {
  createMonthlyReportDraftInputSchema,
  saveMonthlyReportDraftInputSchema,
} from "./monthly-report-input";

const id = "123e4567-e89b-42d3-a456-426614174000";
const emptySections = {
  healthContent: "",
  educationOccupationContent: "",
  emotionsBehaviorContent: "",
  socialRelationsContent: "",
  dailyLivingIndependenceContent: "",
  otherContent: "",
} as const;

describe("Monthly Report input", () => {
  it("accepts a database-safe explicit calendar month", () => {
    expect(
      createMonthlyReportDraftInputSchema.parse({
        clientId: id,
        calendarYear: 2026,
        calendarMonth: 8,
      }),
    ).toEqual({ clientId: id, calendarYear: 2026, calendarMonth: 8 });

    for (const calendarMonth of [0, 13, 1.5]) {
      expect(
        createMonthlyReportDraftInputSchema.safeParse({
          clientId: id,
          calendarYear: 2026,
          calendarMonth,
        }).success,
      ).toBe(false);
    }
  });

  it("allows an empty draft save but enforces combined section bounds", () => {
    expect(
      saveMonthlyReportDraftInputSchema.safeParse({
        monthlyReportId: id,
        expectedVersion: 1,
        ...emptySections,
      }).success,
    ).toBe(true);
    expect(
      saveMonthlyReportDraftInputSchema.safeParse({
        monthlyReportId: id,
        expectedVersion: 1,
        ...emptySections,
        healthContent: "x".repeat(100_001),
      }).success,
    ).toBe(false);
  });
});
