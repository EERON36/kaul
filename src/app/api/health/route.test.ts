import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  assertStoredKeys: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

vi.mock("@/modules/clients/personal-identity-number", () => ({
  assertStoredPersonalIdentityNumberKeysAvailable: mocks.assertStoredKeys,
}));

import { GET } from "./route";

beforeEach(() => {
  mocks.queryRaw.mockReset().mockResolvedValue([{ result: 1 }]);
  mocks.assertStoredKeys.mockReset().mockResolvedValue(undefined);
});

describe("health route", () => {
  it("returns ok only after database and Personnummer key compatibility pass", async () => {
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.status).toBe(200);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.assertStoredKeys).toHaveBeenCalledOnce();
  });

  it("fails closed with a generic response when stored keys are unavailable", async () => {
    mocks.assertStoredKeys.mockRejectedValue(
      new Error("unknown-fictional-key-sensitive-detail"),
    );
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("unavailable");
    expect(body).not.toContain("unknown-fictional-key-sensitive-detail");
  });
});
