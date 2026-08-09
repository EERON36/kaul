import { afterEach, describe, expect, it, vi } from "vitest";

const passwordChangeMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../modules/authentication/password-change", () => ({
  changeForcedPassword: passwordChangeMock,
}));

import { AuthenticationGuardError } from "../../../../modules/authentication/guards";
import { ForcedPasswordChangeError } from "../../../../modules/authentication/password-change-internal";
import { AuditError } from "../../../../modules/audit/audit";

import { POST } from "./route";

const requestBody = {
  currentPassword: "Fictional temporary password",
  newPassword: "Fictional replacement passphrase",
  confirmPassword: "Fictional replacement passphrase",
};

function createRequest(): Request {
  return new Request("http://localhost:3000/api/kaul/change-password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(requestBody),
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("controlled password-change route", () => {
  it("forwards one replacement cookie unchanged", async () => {
    const cookie = "session=fictional; Path=/; HttpOnly; SameSite=Lax; Secure";
    passwordChangeMock.mockResolvedValue({ setCookieHeaders: [cookie] });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([cookie]);
  });

  it("preserves multiple cookies, attributes, order, and Expires commas", async () => {
    const cookies = [
      "session=fictional; Path=/; HttpOnly; SameSite=Lax; Secure",
      "dontRemember=true; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/; HttpOnly; SameSite=Lax",
    ];
    passwordChangeMock.mockResolvedValue({ setCookieHeaders: cookies });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(cookies);
  });

  it("maps only expected password verification failure to generic feedback", async () => {
    passwordChangeMock.mockRejectedValue(
      new ForcedPasswordChangeError("AUTHENTICATION_FAILED"),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "PASSWORD_CHANGE_FAILED",
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    new AuthenticationGuardError("INCONSISTENT_ORGANISATION"),
    new Error("fictional internal database detail"),
  ])(
    "propagates unexpected failures without producing a response",
    async (error) => {
      passwordChangeMock.mockRejectedValue(error);

      await expect(POST(createRequest())).rejects.toBe(error);
    },
  );

  it.each([
    new ForcedPasswordChangeError("INCONSISTENT_RESULT"),
    new AuditError("OPERATION_REQUIRES_REVIEW"),
    new AuditError("INCONSISTENT_OPERATION"),
    new AuditError("INTENT_PERSISTENCE_FAILED"),
    new AuditError("OUTCOME_PERSISTENCE_FAILED"),
  ])(
    "returns a generic cookie-free response for fail-closed audit state",
    async (error) => {
      passwordChangeMock.mockRejectedValue(error);

      const response = await POST(createRequest());

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        code: "PASSWORD_CHANGE_FAILED",
      });
      expect(response.headers.getSetCookie()).toEqual([]);
    },
  );
});
