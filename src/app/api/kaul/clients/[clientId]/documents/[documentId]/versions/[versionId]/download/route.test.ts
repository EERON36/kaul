import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentError } from "@/modules/documents/documents-internal";

const { authoriseDocumentDownload } = vi.hoisted(() => ({
  authoriseDocumentDownload: vi.fn(),
}));

vi.mock("@/modules/documents/documents", () => ({
  authoriseDocumentDownload,
}));

import { GET } from "./route";

const params = {
  clientId: "11111111-1111-4111-8111-111111111111",
  documentId: "22222222-2222-4222-8222-222222222222",
  versionId: "33333333-3333-4333-8333-333333333333",
};

beforeEach(() => {
  authoriseDocumentDownload.mockReset();
});

describe("document download route", () => {
  it("forces a safe attachment with private no-store response headers", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    authoriseDocumentDownload.mockResolvedValue({
      handle: {
        size: 9,
        createReadStream: () => Readable.from([Buffer.from("fictional")]),
        close,
      },
      displayFilename: "farlig\r\nX-Test: ja åäö.txt",
      mediaType: "text/plain",
      sizeBytes: 9,
    });
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("content-length")).toBe("9");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^attachment;/);
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    await expect(response.text()).resolves.toBe("fictional");
    expect(close).toHaveBeenCalled();
  });

  it("returns a bodyless non-disclosing response when authorization fails", async () => {
    authoriseDocumentDownload.mockRejectedValue(
      new DocumentError("TARGET_UNAVAILABLE"),
    );
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });
});
