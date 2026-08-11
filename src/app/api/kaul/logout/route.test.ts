import { afterEach, describe, expect, it, vi } from "vitest";

const logoutMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../modules/authentication/logout", () => ({
  logoutCurrentSession: logoutMock,
}));

import { POST } from "./route";

function request(origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/kaul/logout", {
    method: "POST",
    headers: { origin, cookie: "fictional-authentication-cookie" },
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("controlled logout route", () => {
  it("forwards all Better Auth cookie expirations after logout handling", async () => {
    const cookies = [
      "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
      "better-auth.session_data=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly",
    ];
    logoutMock.mockResolvedValue({ setCookieHeaders: cookies });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ code: "LOGGED_OUT" });
    expect(response.headers.getSetCookie()).toEqual(cookies);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(logoutMock).toHaveBeenCalledWith(
      expect.objectContaining({ get: expect.any(Function) }),
    );
  });

  it.each(["http://malicious.example", "not a URL"])(
    "rejects untrusted origin %s without invoking logout",
    async (origin) => {
      const response = await POST(request(origin));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ code: "LOGOUT_FAILED" });
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(logoutMock).not.toHaveBeenCalled();
    },
  );
});
