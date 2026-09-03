import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  createStaffAction: vi.fn(),
  deactivateStaffAction: vi.fn(),
  reactivateStaffAction: vi.fn(),
  resetStaffPasswordAction: vi.fn(),
}));

import { StaffManagement } from "./staff-management-client";

function renderStaff(canResetPassword: boolean): string {
  return renderToStaticMarkup(
    createElement(StaffManagement, {
      createOperationId: "123e4567-e89b-42d3-a456-426614174001",
      staff: [
        {
          id: "fictional-staff-id",
          name: "Fiktiv Medarbetare",
          email: "fictional.staff@example.test",
          professionalTitle: "Fiktiv behandlare",
          active: true,
          canResetPassword,
          operationId: "123e4567-e89b-42d3-a456-426614174002",
          resetOperationId: "123e4567-e89b-42d3-a456-426614174003",
        },
        {
          id: "fictional-second-staff-id",
          name: "Fiktiv Kollegan",
          email: "fictional.colleague@example.test",
          professionalTitle: "Fiktiv samordnare",
          active: false,
          canResetPassword,
          operationId: "123e4567-e89b-42d3-a456-426614174004",
          resetOperationId: "123e4567-e89b-42d3-a456-426614174005",
        },
      ],
    }),
  );
}

describe("Staff password-reset control", () => {
  it("renders when the server marks the Staff Member eligible", () => {
    expect(renderStaff(true)).toContain("Återställ lösenord");
  });

  it("is hidden when the server marks the Staff Member ineligible", () => {
    expect(renderStaff(false)).not.toContain("Återställ lösenord");
  });

  it("gives repeated Staff actions target-specific accessible names", () => {
    const markup = renderStaff(true);

    expect(markup).toContain('aria-label="Inaktivera Fiktiv Medarbetare"');
    expect(markup).toContain('aria-label="Återaktivera Fiktiv Kollegan"');
    expect(markup).toContain(
      'aria-label="Återställ lösenord för Fiktiv Medarbetare"',
    );
    expect(markup).toContain(
      'aria-label="Återställ lösenord för Fiktiv Kollegan"',
    );
  });
});
