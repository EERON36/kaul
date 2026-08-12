import { describe, expect, it } from "vitest";

import { getClientManagementFeedback } from "./client-feedback";
import { ClientManagementError } from "./clients-internal";

describe("Client management feedback", () => {
  it("maps person-reference conflicts to safe Swedish feedback", () => {
    expect(
      getClientManagementFeedback(
        new ClientManagementError("DUPLICATE_IDENTIFIER"),
      ),
    ).toBe("Personreferensen används redan för en annan klient.");
  });

  it("describes an unchanged Client without claiming an update", () => {
    expect(
      getClientManagementFeedback(new ClientManagementError("NO_CHANGES")),
    ).toBe("Det finns inga ändringar att spara.");
  });

  it("maps archive state and Assignment conflicts to the same safe guidance", () => {
    for (const code of [
      "ARCHIVE_STATE_CONFLICT",
      "ACTIVE_ASSIGNMENTS",
    ] as const) {
      expect(getClientManagementFeedback(new ClientManagementError(code))).toBe(
        "Klienten kan inte arkiveras i sitt nuvarande läge. Ladda om sidan och kontrollera tilldelningarna.",
      );
    }
  });
});
