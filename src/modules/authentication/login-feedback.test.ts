import { describe, expect, it } from "vitest";

import {
  GENERIC_LOGIN_FAILURE_MESSAGE,
  getLoginFailureMessage,
} from "./login-feedback";

describe("login feedback", () => {
  it.each([
    new Error("unknown email: fictional@example.test"),
    { code: "INVALID_PASSWORD", message: "fictional password detail" },
    { code: "BANNED_USER" },
    { code: "FAILED_TO_CREATE_SESSION" },
  ])("never renders raw Better Auth or identity details", (error) => {
    expect(getLoginFailureMessage()).toBe(GENERIC_LOGIN_FAILURE_MESSAGE);
    expect(getLoginFailureMessage()).not.toContain(JSON.stringify(error));
  });
});
