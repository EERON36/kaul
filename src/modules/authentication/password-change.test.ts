import { afterEach, describe, expect, it, vi } from "vitest";

import { getPasswordChangeFeedback } from "./password-change-feedback";
import {
  changeForcedPasswordInternal,
  ForcedPasswordChangeError,
  getReplacementSetCookieHeaders,
} from "./password-change-internal";
import { changeForcedPasswordForTest } from "./password-change.test-support";
import { classifyPasswordChangeTransactionResult } from "./password-change-transaction-result";

const validInput = {
  currentPassword: "Fictional temporary password",
  newPassword: "Fictional replacement passphrase",
  confirmPassword: "Fictional replacement passphrase",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("password-change security boundary", () => {
  it("classifies only an unknown transaction acknowledgement as AMBIGUOUS", () => {
    expect(classifyPasswordChangeTransactionResult("CALLBACK_FAILED")).toBe(
      "FAILED",
    );
    expect(classifyPasswordChangeTransactionResult("COMPLETED")).toBe(
      "SUCCEEDED",
    );
    expect(classifyPasswordChangeTransactionResult("UNKNOWN")).toBe(
      "AMBIGUOUS",
    );
  });
  it("refuses the test-support entry point outside test mode", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => changeForcedPasswordForTest(validInput, {})).toThrow(
      "Password-change test support requires NODE_ENV=test.",
    );
  });

  it("refuses direct injected dependencies outside test mode", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      changeForcedPasswordInternal(validInput, {
        currentTime: () => new Date("2030-01-02T03:04:05Z"),
      }),
    ).rejects.toThrow(
      "Password-change dependencies are available only in tests.",
    );
  });

  it("never renders arbitrary Better Auth or database errors", () => {
    const fictionalSecret =
      "postgresql://fictional:credential@database.example.test/kaul";

    expect(
      getPasswordChangeFeedback({
        code: "INVALID_PASSWORD",
        message: fictionalSecret,
      }),
    ).toBe(
      "Lösenordet kunde inte ändras. Kontrollera uppgifterna och försök igen.",
    );
    expect(getPasswordChangeFeedback(fictionalSecret)).not.toContain(
      fictionalSecret,
    );
  });

  it("preserves ordered Set-Cookie values and their attributes", () => {
    const response = new Response(null, {
      headers: [
        [
          "set-cookie",
          "session=fictional; Path=/; HttpOnly; SameSite=Lax; Secure",
        ],
        [
          "set-cookie",
          "dontRemember=true; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/; HttpOnly; SameSite=Lax",
        ],
      ],
    });

    expect(getReplacementSetCookieHeaders(response)).toEqual([
      "session=fictional; Path=/; HttpOnly; SameSite=Lax; Secure",
      "dontRemember=true; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/; HttpOnly; SameSite=Lax",
    ]);
  });

  it("rejects a nominal success without a replacement cookie", () => {
    expect(() => getReplacementSetCookieHeaders(new Response(null))).toThrow(
      expect.objectContaining<Partial<ForcedPasswordChangeError>>({
        code: "INCONSISTENT_RESULT",
      }),
    );
  });
});
