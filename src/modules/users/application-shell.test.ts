import { describe, expect, it } from "vitest";

import {
  createApplicationShellContext,
  getApplicationNavigation,
} from "./application-shell";

describe("application shell context", () => {
  const baseUser = {
    userId: "user_internal",
    name: "Fiktiv Medarbetare",
    email: "fictional@example.test",
    organisationId: "organisation_internal",
    organisationName: "Fiktiva Omsorgen",
    professionalTitle: "Fiktiv behandlare",
    mustChangePassword: false as const,
    credentialState: "APPLICATION_ALLOWED" as const,
  };

  it("shows only implemented role-appropriate navigation", () => {
    expect(
      getApplicationNavigation({ ...baseUser, role: "ADMINISTRATOR" }),
    ).toEqual([
      { href: "/", label: "Hem" },
      { href: "/klienter", label: "Klienter" },
      { href: "/personal", label: "Personal" },
    ]);
    expect(
      getApplicationNavigation({ ...baseUser, role: "STAFF_MEMBER" }),
    ).toEqual([
      { href: "/", label: "Hem" },
      { href: "/klienter", label: "Klienter" },
    ]);
  });

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
