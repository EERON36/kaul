import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  createAssignmentAction: vi.fn(),
  endAssignmentAction: vi.fn(),
}));

import { AssignmentManagement } from "./assignment-management-client";

describe("Assignment management controls", () => {
  it("gives repeated end actions target-specific accessible names", () => {
    const markup = renderToStaticMarkup(
      createElement(AssignmentManagement, {
        clientId: "fictional-client-id",
        createOperationId: "123e4567-e89b-42d3-a456-426614174001",
        staff: [],
        assignments: [
          {
            id: "fictional-primary-assignment-id",
            responsibility: "PRIMARY" as const,
            startedAt: new Date("2026-08-21T00:00:00.000Z"),
            endedAt: null,
            staffUser: {
              id: "fictional-primary-staff-id",
              name: "Fiktiv Primär",
              professionalTitle: "Fiktiv behandlare",
            },
            operationId: "123e4567-e89b-42d3-a456-426614174002",
          },
          {
            id: "fictional-secondary-assignment-id",
            responsibility: "SECONDARY" as const,
            startedAt: new Date("2026-08-21T00:00:00.000Z"),
            endedAt: null,
            staffUser: {
              id: "fictional-secondary-staff-id",
              name: "Fiktiv Sekundär",
              professionalTitle: "Fiktiv behandlare",
            },
            operationId: "123e4567-e89b-42d3-a456-426614174003",
          },
        ],
      }),
    );

    expect(markup).toContain(
      'aria-label="Avsluta primär tilldelning för Fiktiv Primär"',
    );
    expect(markup).toContain(
      'aria-label="Avsluta sekundär tilldelning för Fiktiv Sekundär"',
    );
  });
});
