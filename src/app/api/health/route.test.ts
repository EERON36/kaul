import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

async function getHealthResponse(): Promise<Response> {
  const { GET } = await import("./route");
  return GET();
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DOCUMENT_STORAGE_ROOT", resolve("fictional-kaul-documents"));
  vi.stubEnv("DOCUMENT_SCANNER_HOST", "fictional-clamav");
  vi.stubEnv("DOCUMENT_SCANNER_PORT", "3310");
  vi.stubEnv("DOCUMENT_SCANNER_TIMEOUT_MS", "15000");
  vi.stubEnv("DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS", "24");
  mocks.queryRaw.mockReset().mockResolvedValue([{ result: 1 }]);
  mocks.assertStoredKeys.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("health route", () => {
  it("returns ok only after database and Personnummer key compatibility pass", async () => {
    const response = await getHealthResponse();
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.status).toBe(200);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.assertStoredKeys).toHaveBeenCalledOnce();
  });

  it("fails closed when required Documents configuration is missing", async () => {
    vi.stubEnv("DOCUMENT_STORAGE_ROOT", "");

    const response = await getHealthResponse();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });

  it("fails closed without leaking malformed Documents configuration", async () => {
    const sensitiveDetail = "relative/fictional-sensitive-storage-path";
    vi.stubEnv("DOCUMENT_STORAGE_ROOT", sensitiveDetail);

    const response = await getHealthResponse();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("unavailable");
    expect(body).not.toContain(sensitiveDetail);
  });

  it("preserves the generic database failure response", async () => {
    mocks.queryRaw.mockRejectedValue(
      new Error("fictional-database-sensitive-detail"),
    );

    const response = await getHealthResponse();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("unavailable");
    expect(body).not.toContain("fictional-database-sensitive-detail");
    expect(mocks.assertStoredKeys).not.toHaveBeenCalled();
  });

  it("fails closed with a generic response when stored keys are unavailable", async () => {
    mocks.assertStoredKeys.mockRejectedValue(
      new Error("unknown-fictional-key-sensitive-detail"),
    );
    const response = await getHealthResponse();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("unavailable");
    expect(body).not.toContain("unknown-fictional-key-sensitive-detail");
  });
});
