import { describe, expect, it, vi } from "vitest";

import { blockRawAdminRoutes } from "./route-policy";

const blockedPaths = [
  "/api/auth/admin/create-user",
  "/api/auth/admin/set-role",
  "/api/auth/admin/impersonate-user",
  "/api/auth/admin/delete-user",
  "/api/auth/admin/set-user-password",
];

function createRequest(pathname: string): Request {
  return new Request(`http://localhost:3000${pathname}`, {
    headers: { "x-real-ip": "203.0.113.10" },
  });
}

describe("raw Better Auth Admin route policy", () => {
  it.each(blockedPaths)("returns a generic 404 for %s", async (pathname) => {
    const handler = vi.fn(async () => new Response("forwarded"));
    const response = await blockRawAdminRoutes(handler)(
      createRequest(pathname),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(handler).not.toHaveBeenCalled();
  });

  it("forwards a normal Better Auth path to the handler", async () => {
    const handler = vi.fn(
      async () => new Response("forwarded", { status: 200 }),
    );
    const request = createRequest("/api/auth/sign-in/email");
    const response = await blockRawAdminRoutes(handler)(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("forwarded");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(request);
  });
});
