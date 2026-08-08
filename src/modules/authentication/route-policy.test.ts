import { describe, expect, it, vi } from "vitest";

import { applyBetterAuthRoutePolicy } from "./route-policy";

const blockedPaths = [
  "/api/auth/admin/create-user",
  "/api/auth/admin/set-role",
  "/api/auth/admin/impersonate-user",
  "/api/auth/admin/delete-user",
  "/api/auth/admin/set-user-password",
  "/api/auth/change-password",
  "/api/auth/change-password/",
];

function createRequest(pathname: string): Request {
  return new Request(`http://localhost:3000${pathname}`, {
    headers: { "x-real-ip": "203.0.113.10" },
  });
}

describe("Better Auth route policy", () => {
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
