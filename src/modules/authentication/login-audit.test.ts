import { describe, expect, it, vi } from "vitest";

import {
  bufferAuthenticationResponse,
  releaseAuthenticationResponse,
} from "./login-audit-response";
import {
  classifyLoginAuditTransactionResult,
  runLoginAuditTransaction,
} from "./login-audit-transaction-result";
import { handleAuditedEmailSignInInternal } from "./login-audit-internal";
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
