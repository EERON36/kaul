import { describe, expect, it } from "vitest";

import { AuditError } from "../audit/audit";
import { StaffManagementError } from "./staff-management";
import { getStaffManagementFeedback } from "./staff-management-feedback";

describe("staff management feedback", () => {
  it("maps only deliberately controlled application failures", () => {
    expect(
      getStaffManagementFeedback(new StaffManagementError("DUPLICATE_EMAIL")),
    ).toMatch(/E-postadressen används redan/);
    expect(
      getStaffManagementFeedback(
        new StaffManagementError("TARGET_UNAVAILABLE"),
      ),
    ).toMatch(/Medarbetaren kan inte ändras/);
  });

  it("does not downgrade audit or integrity failures to form feedback", () => {
    expect(
      getStaffManagementFeedback(
        new AuditError(
          "OPERATION_REQUIRES_REVIEW",
          "c2f4942b-87a5-42c7-a381-020a689a18cf",
        ),
      ),
    ).toBeUndefined();
    expect(
      getStaffManagementFeedback(
        new StaffManagementError("INCONSISTENT_RESULT"),
      ),
    ).toBeUndefined();
    expect(
      getStaffManagementFeedback(
        new StaffManagementError("OPERATION_AMBIGUOUS"),
      ),
    ).toBeUndefined();
  });
});
