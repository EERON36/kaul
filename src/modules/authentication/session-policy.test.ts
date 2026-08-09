import { describe, expect, it, vi } from "vitest";

import {
  canCreateSession,
  limitSessionExpiry,
  SESSION_LIFETIME_SECONDS,
} from "./session-policy";

function databaseWithUser(user: unknown) {
  return {
    user: {
      findUnique: vi.fn(async () => user),
    },
  };
}

const currentTime = new Date("2030-01-02T03:04:05.000Z");

describe("session creation policy", () => {
  it("limits a longer Better Auth Session to twelve hours", () => {
    const createdAt = new Date("2030-01-02T03:04:05.000Z");

    expect(
      limitSessionExpiry({
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
      }),
    ).toEqual(new Date(createdAt.getTime() + SESSION_LIFETIME_SECONDS * 1_000));
  });

  it("does not extend a shorter Better Auth Session", () => {
    const createdAt = new Date("2030-01-02T03:04:05.000Z");
    const shorterExpiry = new Date(createdAt.getTime() + 60 * 60 * 1_000);

    expect(limitSessionExpiry({ createdAt, expiresAt: shorterExpiry })).toBe(
      shorterExpiry,
    );
  });

  it.each([false, null])(
    "permits an active user with banned=%s",
    async (banned) => {
      const database = databaseWithUser({
        banned,
        mustChangePassword: true,
        temporaryCredentialExpiresAt: new Date(currentTime.getTime() + 1),
      });

      await expect(
        canCreateSession(database as never, "user_1", currentTime),
      ).resolves.toBe(true);
    },
  );

  it("rejects a missing user", async () => {
    await expect(
      canCreateSession(databaseWithUser(null) as never, "missing", currentTime),
    ).resolves.toBe(false);
  });

  it("rejects a banned user", async () => {
    const database = databaseWithUser({
      banned: true,
      mustChangePassword: false,
      temporaryCredentialExpiresAt: null,
    });

    await expect(
      canCreateSession(database as never, "user_1", currentTime),
    ).resolves.toBe(false);
  });

  it("rejects an expired temporary credential", async () => {
    const database = databaseWithUser({
      banned: false,
      mustChangePassword: true,
      temporaryCredentialExpiresAt: currentTime,
    });

    await expect(
      canCreateSession(database as never, "user_1", currentTime),
    ).resolves.toBe(false);
  });

  it("ignores stale expiry when forced change is complete", async () => {
    const database = databaseWithUser({
      banned: false,
      mustChangePassword: false,
      temporaryCredentialExpiresAt: new Date("2020-01-01T00:00:00Z"),
    });

    await expect(
      canCreateSession(database as never, "user_1", currentTime),
    ).resolves.toBe(true);
  });
});
