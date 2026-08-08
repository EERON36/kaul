import { z } from "zod";

import { StaffManagementError } from "./staff-management";

export function getStaffManagementFeedback(error: unknown): string | undefined {
  if (error instanceof z.ZodError) {
    return "Kontrollera att alla uppgifter är korrekt ifyllda och försök igen.";
  }

  if (error instanceof StaffManagementError) {
    if (error.code === "DUPLICATE_EMAIL") {
      return "E-postadressen används redan. Kontrollera adressen och försök igen.";
    }

    if (error.code === "TARGET_UNAVAILABLE") {
      return "Medarbetaren kan inte ändras. Ladda om sidan och försök igen.";
    }
  }

  return undefined;
}
