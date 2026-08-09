import { ZodError } from "zod";

import { ClientManagementError } from "./clients-internal";

export function getClientManagementFeedback(error: unknown): string | null {
  if (error instanceof ZodError) {
    return "Kontrollera uppgifterna och försök igen.";
  }

  if (error instanceof ClientManagementError) {
    if (error.code === "DUPLICATE_IDENTIFIER") {
      return "Personreferensen används redan för en annan klient.";
    }
    if (error.code === "TARGET_UNAVAILABLE") {
      return "Uppgiften är inte längre tillgänglig. Ladda om sidan och försök igen.";
    }
    if (error.code === "ASSIGNMENT_CONFLICT") {
      return "Tilldelningen kan inte genomföras i klientens nuvarande läge.";
    }
  }

  return null;
}
