import { describe, expect, it } from "vitest";

import {
  forcedPasswordChangeInputSchema,
  getPasswordChangeValidationCode,
} from "./password-change-input";

const validInput = {
  currentPassword: "Fiktivt tillfälligt lösenord",
  newPassword: "en lång fiktiv lösenfras",
  confirmPassword: "en lång fiktiv lösenfras",
};

describe("forced password-change input", () => {
  it.each([15, 128])("accepts the %s-character boundary", (length) => {
    const password = " ".repeat(length);

    expect(
      forcedPasswordChangeInputSchema.safeParse({
        ...validInput,
        newPassword: password,
        confirmPassword: password,
      }).success,
    ).toBe(true);
  });

  it("accepts spaces and passphrases", () => {
    expect(forcedPasswordChangeInputSchema.safeParse(validInput).success).toBe(
      true,
    );
  });

  it.each([
    ["", "CURRENT_PASSWORD_REQUIRED"],
    ["x".repeat(14), "NEW_PASSWORD_TOO_SHORT"],
    ["x".repeat(129), "NEW_PASSWORD_TOO_LONG"],
  ])("rejects a bounded invalid password", (password, expectedCode) => {
    const field = password === "" ? "currentPassword" : "newPassword";
    const result = forcedPasswordChangeInputSchema.safeParse({
      ...validInput,
      [field]: password,
      ...(field === "newPassword" ? { confirmPassword: password } : {}),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getPasswordChangeValidationCode(result.error)).toBe(expectedCode);
    }
  });

  it("rejects a confirmation mismatch", () => {
    const result = forcedPasswordChangeInputSchema.safeParse({
      ...validInput,
      confirmPassword: "en annan fiktiv lösenfras",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getPasswordChangeValidationCode(result.error)).toBe(
        "PASSWORDS_DO_NOT_MATCH",
      );
    }
  });

  it("rejects unknown system fields", () => {
    expect(
      forcedPasswordChangeInputSchema.safeParse({
        ...validInput,
        role: "ADMINISTRATOR",
        organisationId: "browser-controlled",
        mustChangePassword: false,
      }).success,
    ).toBe(false);
  });
});
