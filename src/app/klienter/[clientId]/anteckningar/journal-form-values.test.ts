import { describe, expect, it } from "vitest";

import {
  formatJournalFormDateTime,
  parseStockholmEventDateTime,
  readJournalFormValues,
} from "./journal-form-values";

describe("Journal event time form boundary", () => {
  it("resolves Swedish summer and winter wall times to unambiguous instants", () => {
    expect(
      parseStockholmEventDateTime("2026-08-12", "08:15")?.toISOString(),
    ).toBe("2026-08-12T06:15:00.000Z");
    expect(
      parseStockholmEventDateTime("2026-01-12", "08:15")?.toISOString(),
    ).toBe("2026-01-12T07:15:00.000Z");
  });

  it("rejects a wall time skipped by the Swedish daylight-saving transition", () => {
    expect(parseStockholmEventDateTime("2026-03-29", "02:30")).toBeNull();
  });

  it("rejects a repeated Swedish wall time instead of guessing an offset", () => {
    expect(parseStockholmEventDateTime("2026-10-25", "02:30")).toBeNull();
  });

  it("formats stored instants into separate Swedish local date and time fields", () => {
    expect(formatJournalFormDateTime(new Date("2026-08-12T06:15:00Z"))).toEqual(
      { eventDate: "2026-08-12", eventTime: "08:15" },
    );
  });

  it("returns Swedish field errors while preserving submitted content", () => {
    const form = new FormData();
    form.set("entryType", "INCIDENT");
    form.set("eventDate", "2026-02-30");
    form.set("eventTime", "08:15");
    form.set("content", "  ");

    const result = readJournalFormValues(form);

    expect(result.values.content).toBe("  ");
    expect(result.fieldErrors).toMatchObject({
      entryType: "Välj en giltig typ av anteckning.",
      eventTime:
        "Tiden kan inte tolkas entydigt i svensk lokal tid. Kontrollera eller välj en annan tid.",
      content: "Skriv en anteckning.",
    });
  });
});
