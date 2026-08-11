import { afterEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "../../generated/prisma/client";
import {
  logoutCurrentSessionInternal,
  type LogoutMarker,
  type LogoutTestDependencies,
  type TrustedLogoutSession,
} from "./logout-internal";
import { logoutCurrentSessionForTest } from "./logout.test-support";
import { runLogoutDeletionTransaction } from "./logout-transaction-result";

const operationId = "123e4567-e89b-42d3-a456-426614174000";
const trustedSession: TrustedLogoutSession = {
  sessionId: "fictional-session-id",
  userId: "fictional-user-id",
  organisationId: "fictional-organisation-id",
};
const clearingCookie =
  "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";

function provenCommitTimeoutRollback(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    "Fictional structured transaction timeout.",
    {
      code: "P2028",
      clientVersion: Prisma.prismaVersion.client,
      meta: { operation: "commit", timeout: 50, timeTaken: 75 },
    },
  );
}

function unknownCommitAcknowledgement(): Prisma.PrismaClientUnknownRequestError {
  return new Prisma.PrismaClientUnknownRequestError(
    "Fictional unresolvable commit acknowledgement.",
    { clientVersion: Prisma.prismaVersion.client },
  );
}

function transaction(options?: { deletionVerified?: boolean }) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    session: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({
          id: trustedSession.sessionId,
          userId: trustedSession.userId,
        })
        .mockResolvedValueOnce(
          options?.deletionVerified === false
            ? { id: trustedSession.sessionId }
            : null,
        ),
    },
  } as never;
}

function dependencies(
  overrides: LogoutTestDependencies = {},
): LogoutTestDependencies {
  const database = transaction();

  return {
    operationId,
    async createCookieClearingHeaders() {
      return [clearingCookie];
    },
    async loadTrustedSession() {
      return trustedSession;
    },
    async createIntent() {
      return { operationId } as never;
    },
    async performBetterAuthSignOut() {
      return Response.json({ success: true });
    },
    async transactionExecutor(callback) {
      await callback(database);
    },
    async recordSucceededOutcome() {},
    async recordFailedOutcome() {},
    async recordAmbiguousOutcome() {},
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("LOGOUT_SUCCEEDED transaction classification", () => {
  it("classifies a callback exception as a definitive rollback", async () => {
    await expect(
      runLogoutDeletionTransaction(
        async (callback) => callback("transaction"),
        async () => {
          throw new Error("definitive rollback");
        },
      ),
    ).resolves.toEqual({ state: "CALLBACK_FAILED" });
  });

  it("classifies Prisma's structured expired-commit state as a definitive rollback", async () => {
    await expect(
      runLogoutDeletionTransaction(
        async (callback) => {
          await callback("transaction");
          throw provenCommitTimeoutRollback();
        },
        async () => undefined,
      ),
    ).resolves.toEqual({ state: "CALLBACK_FAILED" });
  });

  it("classifies an acknowledged commit as completed", async () => {
    await expect(
      runLogoutDeletionTransaction(
        async (callback) => callback("transaction"),
        async () => undefined,
      ),
    ).resolves.toEqual({ state: "COMPLETED" });
  });

  it("reserves unknown for an unresolvable Prisma commit acknowledgement", async () => {
    await expect(
      runLogoutDeletionTransaction(
        async (callback) => {
          await callback("transaction");
          throw unknownCommitAcknowledgement();
        },
        async () => undefined,
      ),
    ).resolves.toEqual({ state: "UNKNOWN" });
  });
});

describe("audited explicit logout", () => {
  it("records success only after verified, acknowledged deletion", async () => {
    const markers: LogoutMarker[] = [];
    const createIntent = vi.fn(async () => ({ operationId }) as never);
    const recordSucceededOutcome = vi.fn(async () => undefined);

    const result = await logoutCurrentSessionForTest(
      new Headers({ cookie: "fictional-cookie" }),
      dependencies({
        createIntent,
        recordSucceededOutcome,
        onMarker: (marker) => markers.push(marker),
      }),
    );

    expect(result.setCookieHeaders).toEqual([clearingCookie]);
    expect(markers).toEqual([
      "COOKIE_CLEAR_READY",
      "SESSION_TRUSTED",
      "INTENT_PERSISTED",
      "DELETION_VERIFIED",
      "DELETION_COMMITTED",
      "SUCCEEDED_APPENDED",
    ]);
    expect(createIntent).toHaveBeenCalledWith({
      operationId,
      actor: {
        userId: trustedSession.userId,
        organisationId: trustedSession.organisationId,
      },
    });
    expect(recordSucceededOutcome).toHaveBeenCalledTimes(1);
  });

  it("returns cookie clearing when success-outcome persistence fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const recordSucceededOutcome = vi.fn(async () => {
      throw new Error("secret outcome storage detail");
    });

    const result = await logoutCurrentSessionForTest(
      new Headers({ cookie: "secret-cookie-value" }),
      dependencies({ recordSucceededOutcome }),
    );

    expect(result.setCookieHeaders).toEqual([clearingCookie]);
    expect(recordSucceededOutcome).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout audit persistence failed."],
    ]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(
      /secret|fictional-session-id|fictional-user-id/i,
    );
  });

  it("records failure and never success when deletion is not verified", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const recordSucceededOutcome = vi.fn(async () => undefined);
    const recordFailedOutcome = vi.fn(async () => undefined);
    const database = transaction({ deletionVerified: false });

    const result = await logoutCurrentSessionForTest(
      new Headers({ cookie: "fictional-cookie" }),
      dependencies({
        async transactionExecutor(callback) {
          await callback(database);
        },
        recordSucceededOutcome,
        recordFailedOutcome,
      }),
    );

    expect(result.setCookieHeaders).toEqual([clearingCookie]);
    expect(recordSucceededOutcome).not.toHaveBeenCalled();
    expect(recordFailedOutcome).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout Session deletion failed."],
    ]);
  });

  it("records ambiguity and never success when commit acknowledgement is unknown", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const recordSucceededOutcome = vi.fn(async () => undefined);
    const recordAmbiguousOutcome = vi.fn(async () => undefined);
    const createIntent = vi.fn(async () => ({ operationId }) as never);
    const database = transaction();
    const transactionExecutor = vi.fn(
      async (callback: (transaction: never) => Promise<void>) => {
        await callback(database);
        throw unknownCommitAcknowledgement();
      },
    );

    const result = await logoutCurrentSessionForTest(
      new Headers({ cookie: "fictional-cookie" }),
      dependencies({
        createIntent,
        transactionExecutor,
        recordSucceededOutcome,
        recordAmbiguousOutcome,
      }),
    );

    expect(result.setCookieHeaders).toEqual([clearingCookie]);
    expect(recordSucceededOutcome).not.toHaveBeenCalled();
    expect(recordAmbiguousOutcome).toHaveBeenCalledTimes(1);
    expect(createIntent).toHaveBeenCalledTimes(1);
    expect(createIntent).toHaveBeenCalledWith({
      operationId,
      actor: {
        userId: trustedSession.userId,
        organisationId: trustedSession.organisationId,
      },
    });
    expect(transactionExecutor).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout Session deletion state is ambiguous."],
    ]);
  });

  it("logs only the approved static message when trusted Session lookup fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const createIntent = vi.fn();
    const transactionExecutor = vi.fn();

    const result = await logoutCurrentSessionForTest(
      new Headers({ cookie: "fictional-secret-cookie" }),
      dependencies({
        async loadTrustedSession() {
          throw new Error(
            `fictional raw lookup ${trustedSession.sessionId} ${trustedSession.userId} ${trustedSession.organisationId} ${operationId}`,
          );
        },
        createIntent,
        transactionExecutor,
      }),
    );

    expect(result.setCookieHeaders).toEqual([clearingCookie]);
    expect(createIntent).not.toHaveBeenCalled();
    expect(transactionExecutor).not.toHaveBeenCalled();
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout Session deletion failed."],
    ]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(
      /secret|fictional-session-id|fictional-user-id|fictional-organisation-id|123e4567/i,
    );
  });

  it("treats an already absent Session as cookie-only idempotent success", async () => {
    const createIntent = vi.fn();
    const transactionExecutor = vi.fn();

    const result = await logoutCurrentSessionForTest(
      new Headers({ cookie: "stale-fictional-cookie" }),
      dependencies({
        async loadTrustedSession() {
          return null;
        },
        createIntent,
        transactionExecutor,
      }),
    );

    expect(result.setCookieHeaders).toEqual([clearingCookie]);
    expect(createIntent).not.toHaveBeenCalled();
    expect(transactionExecutor).not.toHaveBeenCalled();
  });

  it("clears the cookie without mutating when durable intent is unavailable", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const transactionExecutor = vi.fn();

    const result = await logoutCurrentSessionForTest(
      new Headers({ cookie: "fictional-cookie" }),
      dependencies({
        async createIntent() {
          throw new Error("fictional intent detail");
        },
        transactionExecutor,
      }),
    );

    expect(result.setCookieHeaders).toEqual([clearingCookie]);
    expect(transactionExecutor).not.toHaveBeenCalled();
    expect(consoleError.mock.calls).toEqual([
      ["Kaul logout audit persistence failed."],
    ]);
  });
});

describe("logout test boundary", () => {
  it("refuses dependency injection outside test mode", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      logoutCurrentSessionInternal(new Headers(), {}),
    ).rejects.toThrow("Logout test support requires NODE_ENV=test.");
    expect(() => logoutCurrentSessionForTest(new Headers(), {})).toThrow(
      "Logout test support requires NODE_ENV=test.",
    );
  });
});
