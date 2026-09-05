import { Buffer } from "node:buffer";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DOCUMENT_METADATA_HEADER } from "@/modules/documents/document-input";

const { uploadDocument } = vi.hoisted(() => ({ uploadDocument: vi.fn() }));

vi.mock("@/modules/documents/documents", () => ({ uploadDocument }));

import { POST } from "./route";

const clientId = "11111111-1111-4111-8111-111111111111";

function metadata(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      operationId: "22222222-2222-4222-8222-222222222222",
      title: "Fiktivt dokument",
      description: null,
      originalFilename: "underlag.txt",
      declaredMediaType: "text/plain",
      ...overrides,
    }),
  ).toString("base64url");
}

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/kaul/clients/x/documents", {
    method: "POST",
    body: "fictional",
    duplex: "half",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "text/plain",
      "content-length": "9",
      [DOCUMENT_METADATA_HEADER]: metadata(),
      ...headers,
    },
  } as RequestInit & { duplex: "half" });
}

beforeEach(() => {
  uploadDocument.mockReset();
  uploadDocument.mockResolvedValue({
    documentId: "33333333-3333-4333-8333-333333333333",
    versionId: "44444444-4444-4444-8444-444444444444",
    versionNumber: 1,
  });
});

describe("document upload route", () => {
  it("rejects an untrusted origin before processing the body", async () => {
    const response = await POST(
      request({ origin: "https://attacker.invalid" }),
      {
        params: Promise.resolve({ clientId }),
      },
    );
    expect(response.status).toBe(403);
    expect(uploadDocument).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("rejects declared MIME disagreement with a controlled response", async () => {
    const response = await POST(
      request({
        "content-type": "application/pdf",
        [DOCUMENT_METADATA_HEADER]: metadata(),
      }),
      { params: Promise.resolve({ clientId }) },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "FILE_VALIDATION_FAILED",
    });
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("passes the raw stream and safe metadata to the authenticated boundary", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ clientId }),
    });
    expect(response.status).toBe(201);
    const input = uploadDocument.mock.calls[0]?.[0];
    expect(input).toEqual(
      expect.objectContaining({
        clientId,
        declaredContentLength: "9",
        metadata: expect.objectContaining({
          originalFilename: "underlag.txt",
          declaredMediaType: "text/plain",
        }),
      }),
    );
    expect(input.body).toBeTruthy();
  });
});
