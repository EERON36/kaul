import { describe, expect, it } from "vitest";

import { authenticationOptions } from "./auth";

describe("Better Auth configuration", () => {
  it("disables public signup and automatic sign-in", () => {
    expect(authenticationOptions.emailAndPassword).toEqual({
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: 15,
      maxPasswordLength: 128,
    });
  });

  it("uses absolute database sessions without cookie caching", () => {
    expect(authenticationOptions.session).toEqual({
      expiresIn: 43_200,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    });
  });

  it("uses database rate limiting and only the Caddy-owned IP header", () => {
    expect(authenticationOptions.rateLimit).toEqual({
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
      },
    });
    expect(authenticationOptions.advanced.ipAddress.ipAddressHeaders).toEqual([
      "x-real-ip",
    ]);
  });

  it("keeps the four Kaul fields server-owned", () => {
    expect(authenticationOptions.user.additionalFields).toEqual({
      organisationId: {
        type: "string",
        required: true,
        input: false,
      },
      professionalTitle: {
        type: "string",
        required: true,
        input: false,
      },
      mustChangePassword: {
        type: "boolean",
        required: true,
        defaultValue: true,
        input: false,
      },
      temporaryCredentialExpiresAt: {
        type: "date",
        required: false,
        input: false,
      },
    });
  });

  it("configures only the canonical Kaul roles in the Admin plugin", () => {
    const adminPlugin = authenticationOptions.plugins[0];

    expect(adminPlugin.id).toBe("admin");
    expect(adminPlugin.options).toMatchObject({
      defaultRole: "STAFF_MEMBER",
      adminRoles: ["ADMINISTRATOR"],
    });
    expect(adminPlugin.options?.roles).toEqual({
      ADMINISTRATOR: expect.any(Object),
      STAFF_MEMBER: expect.any(Object),
    });
    expect(adminPlugin.options).not.toHaveProperty("adminUserIds");
  });

  it("keeps origin and cookie protections explicit", () => {
    expect(authenticationOptions.trustedOrigins).toEqual([
      "http://localhost:3000",
    ]);
    expect(authenticationOptions.advanced).toMatchObject({
      crossSubDomainCookies: { enabled: false },
      disableCSRFCheck: false,
      disableOriginCheck: false,
    });
  });
});
