import { describe, expect, it } from "vitest";

import { createApplicationShellContext } from "./application-shell";

describe("application shell context", () => {
  it("projects only trusted display fields", () => {
    const context = createApplicationShellContext({
      userId: "user_internal",
      name: "Fiktiv Administratör",
      email: "fictional@example.test",
      role: "ADMINISTRATOR",
      organisationId: "organisation_internal",
      organisationName: "Fiktiva Omsorgen",
      professionalTitle: "Fiktiv verksamhetsansvarig",
      mustChangePassword: false,
      credentialState: "APPLICATION_ALLOWED",
    });

    expect(context).toEqual({
      name: "Fiktiv Administratör",
      professionalTitle: "Fiktiv verksamhetsansvarig",
      organisationName: "Fiktiva Omsorgen",
      roleLabel: "Administratör",
    });
    expect(context).not.toHaveProperty("userId");
    expect(context).not.toHaveProperty("organisationId");
    expect(context).not.toHaveProperty("email");
    expect(context).not.toHaveProperty("temporaryCredentialExpiresAt");
  });
});
