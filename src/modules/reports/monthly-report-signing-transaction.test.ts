import { describe, expect, it, vi } from "vitest";

import { runMonthlyReportSigningTransaction } from "./monthly-report-signing-transaction";

describe("Monthly Report signing transaction classification", () => {
  it("returns a completed value after an acknowledged commit", async () => {
    const verify = vi.fn();
    await expect(
      runMonthlyReportSigningTransaction(
        async (callback) => callback("transaction"),
        async () => "signed",
        verify,
      ),
    ).resolves.toEqual({ state: "COMPLETED", value: "signed" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("distinguishes callback rollback from an unacknowledged commit", async () => {
    const beforeReturn = new Error("rolled back");
    await expect(
      runMonthlyReportSigningTransaction(
        async (callback) => callback("transaction"),
        async () => {
          throw beforeReturn;
        },
        async () => ({ state: "UNKNOWN" }),
      ),
    ).resolves.toEqual({ state: "ROLLED_BACK", error: beforeReturn });

    await expect(
      runMonthlyReportSigningTransaction(
        async (callback) => {
          await callback("transaction");
          throw new Error("commit acknowledgement lost");
        },
        async () => "signed",
        async () => ({ state: "COMPLETED", value: "verified" }),
      ),
    ).resolves.toEqual({ state: "COMPLETED", value: "verified" });
  });
});
