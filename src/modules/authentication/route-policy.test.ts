import { memoryAdapter, type MemoryDB } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth";
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
  "/api/auth/sign-out",
  "/api/auth/sign-out/",
  "/api/auth/update-user",
  "/api/auth/update-user/",
  "/api/auth/revoke-session",
  "/api/auth/revoke-session/",
  "/api/auth/revoke-sessions",
  "/api/auth/revoke-sessions/",
  "/api/auth/revoke-other-sessions",
  "/api/auth/revoke-other-sessions/",
];

const identityStates = [
  {
    label: "Staff Member",
    role: "STAFF_MEMBER",
    mustChangePassword: false,
    temporaryCredentialExpiresAt: null,
  },
  {
    label: "Administrator",
    role: "ADMINISTRATOR",
    mustChangePassword: false,
    temporaryCredentialExpiresAt: null,
  },
  {
    label: "forced password change",
    role: "STAFF_MEMBER",
    mustChangePassword: true,
    temporaryCredentialExpiresAt: new Date("2032-01-02T00:00:00.000Z"),
  },
  {
    label: "expired temporary credential",
    role: "STAFF_MEMBER",
    mustChangePassword: true,
    temporaryCredentialExpiresAt: new Date("2020-01-02T00:00:00.000Z"),
  },
] as const;

type FixtureUser = {
  name: string;
  role: string;
  mustChangePassword: boolean;
  temporaryCredentialExpiresAt: Date | null;
};

type FixtureSession = {
  id: string;
  token: string;
};

async function createAuthenticatedRouteFixture(
  state: (typeof identityStates)[number],
) {
  const database: MemoryDB = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const authentication = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "fictional-route-policy-secret-at-least-32-characters",
    database: memoryAdapter(database),
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 15,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "STAFF_MEMBER",
          input: false,
        },
        mustChangePassword: {
          type: "boolean",
          required: true,
          defaultValue: false,
          input: false,
        },
        temporaryCredentialExpiresAt: {
          type: "date",
          required: false,
          input: false,
        },
      },
    },
  });
  const signUpResponse = await authentication.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        name: "Original Fictional Name",
        email: `${state.label.replaceAll(" ", "-").toLowerCase()}@example.test`,
        password: "Fictional route policy password 2032",
      }),
    }),
  );
  expect(signUpResponse.status).toBe(200);

  const sessionCookie = signUpResponse.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="))
    ?.split(";", 1)[0];
  expect(sessionCookie).toBeTruthy();

  const user = database.user[0] as FixtureUser | undefined;
  const currentSession = database.session[0] as FixtureSession | undefined;
  expect(user).toBeDefined();
  expect(currentSession).toBeDefined();
  if (!user || !currentSession || !sessionCookie) {
    throw new Error("Authenticated route fixture was not created.");
  }

  user.role = state.role;
  user.mustChangePassword = state.mustChangePassword;
  user.temporaryCredentialExpiresAt = state.temporaryCredentialExpiresAt;
  const otherSessionToken = `fictional-other-session-${state.role}-${state.mustChangePassword}`;
  database.session.push({
    ...currentSession,
    id: `fictional-other-session-id-${state.role}-${state.mustChangePassword}`,
    token: otherSessionToken,
  });

  return {
    database,
    handler: applyBetterAuthRoutePolicy(authentication.handler),
    otherSessionToken,
    sessionCookie,
    user,
  };
}

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

  it.each(identityStates)(
    "blocks raw identity and Session mutations for $label",
    async (state) => {
      const fixture = await createAuthenticatedRouteFixture(state);
      const sessionCount = fixture.database.session.length;
      const mutations = [
        {
          pathname: "/api/auth/update-user",
          body: { name: "Mutated Fictional Name" },
        },
        { pathname: "/api/auth/revoke-sessions", body: {} },
        { pathname: "/api/auth/revoke-other-sessions", body: {} },
        {
          pathname: "/api/auth/revoke-session",
          body: { token: fixture.otherSessionToken },
        },
      ];

      for (const mutation of mutations) {
        const response = await fixture.handler(
          new Request(`http://localhost:3000${mutation.pathname}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: fixture.sessionCookie,
              origin: "http://localhost:3000",
            },
            body: JSON.stringify(mutation.body),
          }),
        );

        expect(response.status).toBe(404);
        expect(await response.text()).toBe("");
        expect(fixture.user.name).toBe("Original Fictional Name");
        expect(fixture.database.session).toHaveLength(sessionCount);
      }

      const approvedResponse = await fixture.handler(
        new Request("http://localhost:3000/api/auth/get-session", {
          headers: { cookie: fixture.sessionCookie },
        }),
      );
      const approvedSession = (await approvedResponse.json()) as {
        user?: { name?: string };
      };

      expect(approvedResponse.status).toBe(200);
      expect(approvedSession.user?.name).toBe("Original Fictional Name");
    },
    15_000,
  );

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
