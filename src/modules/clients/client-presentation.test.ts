import { describe, expect, it } from "vitest";

import { getAssignmentResponsibilityLabel } from "./client-presentation";

describe("Client responsibility presentation", () => {
  it("uses clear Swedish labels for both assignment responsibilities", () => {
    expect(getAssignmentResponsibilityLabel("PRIMARY")).toBe("Primär");
    expect(getAssignmentResponsibilityLabel("SECONDARY")).toBe("Sekundär");
  });
});
