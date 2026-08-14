import { describe, expect, it } from "vitest";

import { runPlanningAuditTransaction } from "./planning-audit-transaction";

describe("Planning audit transaction classification", () => {
  it("classifies a callback failure as a definitive rollback", async () => {
    const error = new Error("Fictional callback failure");
    await expect(
      runPlanningAuditTransaction(
        async (callback) => callback("transaction"),
        async () => {
          throw error;
        },
        async () => ({ state: "UNKNOWN" }),
      ),
    ).resolves.toEqual({ state: "ROLLED_BACK", error });
  });

  it("uses durable verification after the callback has returned", async () => {
    const error = new Error("Fictional commit-stage failure");
    await expect(
      runPlanningAuditTransaction(
        async (callback) => {
          await callback("transaction");
          throw error;
        },
        async () => "completed planning transition",
        async () => ({ state: "ROLLED_BACK" }),
      ),
    ).resolves.toEqual({ state: "ROLLED_BACK", error });
  });

  it("preserves uncertainty when durable verification is unavailable", async () => {
    await expect(
      runPlanningAuditTransaction(
        async (callback) => {
          await callback("transaction");
          throw new Error("Fictional missing commit acknowledgement");
        },
        async () => "completed planning transition",
        async () => {
          throw new Error("Fictional verification failure");
        },
      ),
    ).resolves.toEqual({ state: "UNKNOWN" });
  });

  it("returns an acknowledged successful transition", async () => {
    await expect(
      runPlanningAuditTransaction(
        async (callback) => callback("transaction"),
        async () => "completed planning transition",
        async () => ({ state: "UNKNOWN" }),
      ),
    ).resolves.toEqual({
      state: "COMPLETED",
      value: "completed planning transition",
    });
  });
});
