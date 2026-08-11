import { describe, expect, it, vi } from "vitest";

import {
  applyBetterAuthRoutePolicy,
  isEmailSignInRequest,
  routeEmailSignInRequest,
} from "./route-policy";

const blockedPaths = [
  "/api/auth/admin/create-user",
  "/api/auth/admin/set-role",
  "/api/auth/admin/impersonate-user",
  "/api/auth/admin/delete-user",
  "/api/auth/admin/set-user-password",
  "/api/auth/change-password",
  "/api/auth/change-password/",
];

function createRequest(pathname: string, method = "GET"): Request {
  return new Request(`http://localhost:3000${pathname}`, {
    method,
    headers: { "x-real-ip": "203.0.113.10" },
  });
}

describe("Better Auth route policy", () => {
  it("selects only the exact POST email sign-in boundary for auditing", async () => {
    const auditedHandler = vi.fn(async () => new Response("audited"));
    const globalHandler = vi.fn(async () => new Response("global"));
    const handler = routeEmailSignInRequest(globalHandler, auditedHandler);
    const auditedRequest = createRequest("/api/auth/sign-in/email", "POST");

    expect(isEmailSignInRequest(auditedRequest)).toBe(true);
    expect(await (await handler(auditedRequest)).text()).toBe("audited");
    expect(auditedHandler).toHaveBeenCalledWith(auditedRequest);
    expect(globalHandler).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", "/api/auth/sign-in/email"],
    ["POST", "/api/auth/sign-out"],
    ["POST", "/api/auth/get-session"],
    ["POST", "/api/auth/sign-in/social"],
  ])("keeps %s %s on the global handler", async (method, pathname) => {
    const auditedHandler = vi.fn(async () => new Response("audited"));
    const globalHandler = vi.fn(async () => new Response("global"));
    const request = createRequest(pathname, method);

    expect(isEmailSignInRequest(request)).toBe(false);
    expect(
      await (
        await routeEmailSignInRequest(globalHandler, auditedHandler)(request)
      ).text(),
    ).toBe("global");
    expect(globalHandler).toHaveBeenCalledWith(request);
    expect(auditedHandler).not.toHaveBeenCalled();
  });

  it.each(blockedPaths)("returns a generic 404 for %s", async (pathname) => {
    const handler = vi.fn(async () => new Response("forwarded"));
    const response = await applyBetterAuthRoutePolicy(handler)(
      createRequest(pathname),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403])(
    "normalises an expected sign-in failure with status %s",
    async (status) => {
      const handler = vi.fn(
        async () =>
          new Response("sensitive upstream detail", {
            status,
            headers: { "set-cookie": "unsafe-session=must-not-forward" },
          }),
      );
      const response = await applyBetterAuthRoutePolicy(handler)(
        createRequest("/api/auth/sign-in/email"),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        code: "AUTHENTICATION_FAILED",
      });
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("preserves HTTP 429 rate limiting", async () => {
    const handler = vi.fn(
      async () => new Response("rate limited", { status: 429 }),
    );
    const response = await applyBetterAuthRoutePolicy(handler)(
      createRequest("/api/auth/sign-in/email"),
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toBe("rate limited");
  });

  it("keeps unexpected failures as safe server failures", async () => {
    const handler = vi.fn(
      async () =>
        new Response("fictional database connection details", { status: 503 }),
    );
    const response = await applyBetterAuthRoutePolicy(handler)(
      createRequest("/api/auth/sign-in/email"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      code: "AUTHENTICATION_UNAVAILABLE",
    });
    expect(JSON.stringify(body)).not.toContain("database");
  });

  it("forwards a successful normal Better Auth path", async () => {
    const handler = vi.fn(
      async () => new Response("forwarded", { status: 200 }),
    );
    const request = createRequest("/api/auth/sign-in/email");
    const response = await applyBetterAuthRoutePolicy(handler)(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("forwarded");
    expect(handler).toHaveBeenCalledWith(request);
  });
});
