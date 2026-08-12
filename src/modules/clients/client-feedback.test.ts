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
});
