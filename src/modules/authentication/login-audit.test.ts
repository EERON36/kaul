import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bufferAuthenticationResponse,
  releaseAuthenticationResponse,
} from "./login-audit-response";
import {
  classifyLoginAuditTransactionResult,
  runLoginAuditTransaction,
} from "./login-audit-transaction-result";
import {
  classifyPreTrustLoginFailure,
  handleAuditedEmailSignInInternal,
  persistPreTrustLoginFailure,
  type LoginAuditTestDependencies,
} from "./login-audit-internal";
import { handleAuditedEmailSignInForTest } from "./login-audit.test-support";

describe("LOGIN_SUCCEEDED transaction classification", () => {
  it("classifies a rejected callback as definitive failure", async () => {
    async function execute<TResult>(
      callback: (transaction: string) => Promise<TResult>,
    ): Promise<TResult> {
      return callback("transaction");
    }
    const result = await runLoginAuditTransaction(execute, async () => {
      throw new Error("Deliberate callback failure");
    });

    expect(result).toEqual({ state: "CALLBACK_FAILED" });
    expect(classifyLoginAuditTransactionResult(result.state)).toBe("FAILED");
  });

  it("does not misclassify a later callback failure as ambiguous", async () => {
    async function execute<TResult>(
      callback: (transaction: string) => Promise<TResult>,
    ): Promise<TResult> {
      return callback("transaction");
    }
    const result = await runLoginAuditTransaction(execute, async () => {
      await Promise.resolve();
      throw new Error("Failure after earlier callback work");
    });

    expect(result).toEqual({ state: "CALLBACK_FAILED" });
  });

  it("classifies confirmed completion as success", async () => {
    async function execute<TResult>(
      callback: (transaction: string) => Promise<TResult>,
    ): Promise<TResult> {
      return callback("transaction");
    }
    const result = await runLoginAuditTransaction(
      execute,
      async () => "committed",
    );

    expect(result).toEqual({ state: "COMPLETED", value: "committed" });
    expect(classifyLoginAuditTransactionResult(result.state)).toBe("SUCCEEDED");
  });

  it("classifies failure after callback return as unknown", async () => {
    async function execute<TResult>(
      callback: (transaction: string) => Promise<TResult>,
    ): Promise<TResult> {
      await callback("transaction");
      throw new Error("Commit acknowledgement unavailable");
    }
    const result = await runLoginAuditTransaction(
      execute,
      async () => "callback-complete",
    );

    expect(result).toEqual({ state: "UNKNOWN" });
    expect(classifyLoginAuditTransactionResult(result.state)).toBe("AMBIGUOUS");
  });
});

describe("pre-trust LOGIN_FAILED classification", () => {
  const validFailure = {
    isEmailSignInRequest: true,
    responseStatus: 401,
    responseCode: "INVALID_EMAIL_OR_PASSWORD",
    trustedIdentityEstablished: false,
    loginSucceededIntentExists: false,
    sessionEstablished: false,
    setCookieCount: 0,
  } as const;

  it("classifies an admitted invalid credential failure", () => {
    expect(classifyPreTrustLoginFailure(validFailure)).toBe("LOGIN_FAILED");
  });

  it("does not classify a 401 by status alone", () => {
    expect(
      classifyPreTrustLoginFailure({
        ...validFailure,
        responseCode: undefined,
      }),
    ).toBe("NO_AUDIT");
  });

  it.each([
    ["trusted identity", { trustedIdentityEstablished: true }],
    ["LOGIN_SUCCEEDED intent", { loginSucceededIntentExists: true }],
    ["Session", { sessionEstablished: true }],
    ["authentication cookie", { setCookieCount: 1 }],
    ["malformed validation", { responseStatus: 400 }],
    ["rate limiting", { responseStatus: 429 }],
    ["operational failure", { responseStatus: 503 }],
  ] as const)("does not audit %s", (_label, overrides) => {
    expect(
      classifyPreTrustLoginFailure({ ...validFailure, ...overrides }),
    ).toBe("NO_AUDIT");
  });

  it("requires the exact audited email sign-in route", () => {
    expect(
      classifyPreTrustLoginFailure({
        ...validFailure,
        isEmailSignInRequest: false,
      }),
    ).toBe("NO_AUDIT");
  });
});

describe("pre-trust LOGIN_FAILED persistence failures", () => {
  const operationId = "123e4567-e89b-42d3-a456-426614174000";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs one static message when intent persistence fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const dependencies: LoginAuditTestDependencies = {
      async createFailedLoginIntent() {
        throw new Error("Fictional audit persistence detail");
      },
    };

    await expect(
      persistPreTrustLoginFailure(operationId, dependencies),
    ).resolves.toBeUndefined();
    expect(consoleError.mock.calls).toEqual([
      ["Authentication audit persistence failed."],
    ]);
  });

  it("logs one static message when outcome persistence fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const dependencies: LoginAuditTestDependencies = {
      async createFailedLoginIntent() {
        return { operationId } as never;
      },
      async recordFailedLoginOutcome() {
        throw new Error("Fictional outcome persistence detail");
      },
    };

    await expect(
      persistPreTrustLoginFailure(operationId, dependencies),
    ).resolves.toBeUndefined();
    expect(consoleError.mock.calls).toEqual([
      ["Authentication audit persistence failed."],
    ]);
  });
});

describe("LOGIN_SUCCEEDED response buffering", () => {
  it("preserves body, status, ordinary headers, and separate cookies", async () => {
    const response = new Response("fictional response", {
      status: 201,
      statusText: "Created",
      headers: [
        ["x-fictional-header", "preserved"],
        ["set-cookie", "first=fictional; Path=/; HttpOnly; SameSite=Lax"],
        [
          "set-cookie",
          "second=fictional; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/; HttpOnly",
        ],
      ],
    });

    const buffered = await bufferAuthenticationResponse(response);
    const released = releaseAuthenticationResponse(buffered);

    expect(released.status).toBe(201);
    expect(released.statusText).toBe("Created");
    expect(released.headers.get("x-fictional-header")).toBe("preserved");
    expect(released.headers.getSetCookie()).toEqual([
      "first=fictional; Path=/; HttpOnly; SameSite=Lax",
      "second=fictional; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/; HttpOnly",
    ]);
    expect(await released.text()).toBe("fictional response");
  });
});

describe("LOGIN_SUCCEEDED test boundary", () => {
  it("refuses test dependency injection outside test mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new Request(
      "http://localhost:3000/api/auth/sign-in/email",
      { method: "POST" },
    );

    expect(() => handleAuditedEmailSignInForTest(request, {})).toThrow(
      "Login-audit test support requires NODE_ENV=test.",
    );
    vi.unstubAllEnvs();
  });

  it("refuses direct internal dependency injection outside test mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new Request(
      "http://localhost:3000/api/auth/sign-in/email",
      { method: "POST" },
    );

    await expect(handleAuditedEmailSignInInternal(request, {})).rejects.toThrow(
      "Login-audit test support requires NODE_ENV=test.",
    );
    vi.unstubAllEnvs();
  });
});
