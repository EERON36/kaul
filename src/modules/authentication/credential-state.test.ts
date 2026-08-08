import { describe, expect, it } from "vitest";

import { getCredentialState } from "./credential-state";

const expiry = new Date("2030-01-02T03:04:05.000Z");

describe("credential state", () => {
  it("requires a password change immediately before expiry", () => {
    expect(
      getCredentialState(true, expiry, new Date(expiry.getTime() - 1)),
    ).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("expires a temporary credential at the exact boundary", () => {
    expect(getCredentialState(true, expiry, expiry)).toBe(
      "TEMPORARY_CREDENTIAL_EXPIRED",
    );
  });

  it("ignores stale expiry after forced change is complete", () => {
    expect(
      getCredentialState(false, expiry, new Date("2040-01-01T00:00:00Z")),
    ).toBe("APPLICATION_ALLOWED");
  });
});
