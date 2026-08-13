import { describe, expect, it } from "vitest";

import { runJournalSigningTransaction } from "./journal-signing-transaction";

describe("Journal signing transaction classification", () => {
  it("classifies a callback failure as a definitive rollback", async () => {
    const error = new Error("Fictional callback failure");

    await expect(
      runJournalSigningTransaction(
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
      runJournalSigningTransaction(
        async (callback) => {
          await callback("transaction");
          throw error;
        },
        async () => "signed entry",
        async () => ({ state: "ROLLED_BACK" }),
      ),
    ).resolves.toEqual({ state: "ROLLED_BACK", error });
  });

  it("preserves genuine uncertainty when durable verification is unavailable", async () => {
    await expect(
      runJournalSigningTransaction(
        async (callback) => {
          await callback("transaction");
          throw new Error("Fictional missing commit acknowledgement");
        },
        async () => "signed entry",
        async () => {
          throw new Error("Fictional verification failure");
        },
      ),
    ).resolves.toEqual({ state: "UNKNOWN" });
  });

  it("returns an acknowledged successful signing", async () => {
    await expect(
      runJournalSigningTransaction(
        async (callback) => callback("transaction"),
        async () => "signed entry",
        async () => ({ state: "UNKNOWN" }),
      ),
    ).resolves.toEqual({ state: "COMPLETED", value: "signed entry" });
  });
});
