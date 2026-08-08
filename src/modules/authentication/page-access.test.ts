import { describe, expect, it } from "vitest";

import {
  getApplicationErrorRedirect,
  getAuthenticatedDestination,
  getPasswordChangeErrorRedirect,
  isLoginPageVisibleError,
} from "./page-access";

describe("authentication page access", () => {
  it.each([
    ["APPLICATION_ALLOWED", "/"],
    ["PASSWORD_CHANGE_REQUIRED", "/byt-losenord"],
    ["TEMPORARY_CREDENTIAL_EXPIRED", "/byt-losenord"],
  ] as const)("maps %s to %s", (state, destination) => {
    expect(getAuthenticatedDestination(state)).toBe(destination);
  });

  it.each([
    ["UNAUTHENTICATED", "/login"],
    ["ACCOUNT_INACTIVE", "/login"],
    ["INCONSISTENT_ORGANISATION", undefined],
    ["PASSWORD_CHANGE_REQUIRED", "/byt-losenord"],
    ["TEMPORARY_CREDENTIAL_EXPIRED", "/byt-losenord"],
    ["FORBIDDEN", undefined],
  ] as const)("maps application error %s safely", (code, destination) => {
    expect(getApplicationErrorRedirect(code)).toBe(destination);
  });

  it("does not turn forbidden or forced-change errors into a login form", () => {
    expect(isLoginPageVisibleError("UNAUTHENTICATED")).toBe(true);
    expect(isLoginPageVisibleError("FORBIDDEN")).toBe(false);
    expect(isLoginPageVisibleError("PASSWORD_CHANGE_REQUIRED")).toBe(false);
    expect(isLoginPageVisibleError("INCONSISTENT_ORGANISATION")).toBe(false);
  });

  it("propagates integrity failures from root and password-change pages", () => {
    expect(getApplicationErrorRedirect("INCONSISTENT_ORGANISATION")).toBe(
      undefined,
    );
    expect(getPasswordChangeErrorRedirect("INCONSISTENT_ORGANISATION")).toBe(
      undefined,
    );
    expect(getPasswordChangeErrorRedirect("UNAUTHENTICATED")).toBe("/login");
    expect(getPasswordChangeErrorRedirect("ACCOUNT_INACTIVE")).toBe("/login");
  });
});
