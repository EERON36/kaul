import { describe, expect, it } from "vitest";

import {
  getFollowUpDueState,
  parseCalendarDate,
  resolveStockholmDateTime,
} from "./stockholm-time";

describe("Stockholm operational time", () => {
  it("rejects nonexistent and ambiguous Stockholm wall times", () => {
    expect(resolveStockholmDateTime("2026-03-29", "02:30")).toBeNull();
    expect(resolveStockholmDateTime("2026-10-25", "02:30")).toBeNull();
  });

  it("resolves unambiguous winter and summer wall times", () => {
    expect(resolveStockholmDateTime("2026-01-12", "08:15")?.toISOString()).toBe(
      "2026-01-12T07:15:00.000Z",
    );
    expect(resolveStockholmDateTime("2026-08-12", "08:15")?.toISOString()).toBe(
      "2026-08-12T06:15:00.000Z",
    );
  });

  it("derives date-only, timed, today, and seven-day boundary states", () => {
    const now = new Date("2026-08-13T10:00:00.000Z"); // 12:00 Stockholm
    const dueDate = (value: string) => {
      const parsed = parseCalendarDate(value);
      if (!parsed) throw new Error("Test date is invalid.");
      return parsed;
    };

    expect(
      getFollowUpDueState({ dueDate: dueDate("2026-08-12"), dueAt: null }, now),
    ).toBe("OVERDUE");
    expect(
      getFollowUpDueState(
        {
          dueDate: dueDate("2026-08-13"),
          dueAt: new Date("2026-08-13T09:59:00.000Z"),
        },
        now,
      ),
    ).toBe("OVERDUE");
    expect(
      getFollowUpDueState({ dueDate: dueDate("2026-08-13"), dueAt: null }, now),
    ).toBe("DUE_TODAY");
    expect(
      getFollowUpDueState({ dueDate: dueDate("2026-08-20"), dueAt: null }, now),
    ).toBe("UPCOMING");
    expect(
      getFollowUpDueState({ dueDate: dueDate("2026-08-21"), dueAt: null }, now),
    ).toBe("OUTSIDE_WINDOW");
  });
});
