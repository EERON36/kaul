import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemDocumentStorage } from "./document-storage";
import { MAX_DOCUMENT_SIZE_BYTES } from "./document-input";
import {
  DocumentValidationError,
  storeBoundedUpload,
  validateStoredUpload,
} from "./document-validation";

const roots: string[] = [];

async function fixture() {
  const root = resolve(await mkdtemp(join(tmpdir(), "kaul-validation-")));
  roots.push(root);
  return new FileSystemDocumentStorage(root);
}

function body(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function validPng(width = 1, height = 1): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", Buffer.from([0])),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function validJpeg(width = 1, height = 1): Buffer {
  const dimensions = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    dimensions,
    Buffer.from([0xff, 0xda, 0x00, 0x02, 0x00, 0xff, 0xd9]),
  ]);
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { force: true, recursive: true });
  }
});

describe("Document content validation", () => {
  it("streams, counts and hashes valid PDF and UTF-8 text", async () => {
    const storage = await fixture();
    for (const test of [
      {
        bytes: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
        type: { extension: "pdf", mediaType: "application/pdf" } as const,
      },
      {
        bytes: Buffer.from("Fiktiv svensk text åäö\n", "utf8"),
        type: { extension: "txt", mediaType: "text/plain" } as const,
      },
    ]) {
      const upload = await storeBoundedUpload(
        storage,
        body(test.bytes),
        String(test.bytes.length),
      );
      expect(upload.sizeBytes).toBe(test.bytes.length);
      expect(upload.sha256).toMatch(/^[0-9a-f]{64}$/);
      await expect(
        validateStoredUpload(storage, upload, test.type),
      ).resolves.toBeUndefined();
      await storage.removeQuarantine(upload.quarantineKey);
    }
  });

  it("accepts bounded structurally valid PNG and JPEG images", async () => {
    const storage = await fixture();
    for (const test of [
      {
        bytes: validPng(),
        type: { extension: "png", mediaType: "image/png" } as const,
      },
      {
        bytes: validJpeg(),
        type: { extension: "jpg", mediaType: "image/jpeg" } as const,
      },
    ]) {
      const upload = await storeBoundedUpload(storage, body(test.bytes), null);
      expect(upload.sha256).toBe(
        createHash("sha256").update(test.bytes).digest("hex"),
      );
      await expect(
        validateStoredUpload(storage, upload, test.type),
      ).resolves.toBeUndefined();
      await storage.removeQuarantine(upload.quarantineKey);
    }
  });

  it("rejects image bombs, missing PNG data, and damaged PNG checksums", async () => {
    const storage = await fixture();
    for (const bytes of [
      validPng(20_001, 1),
      Buffer.concat([
        validPng().subarray(0, 33),
        pngChunk("IEND", Buffer.alloc(0)),
      ]),
      Buffer.from(
        validPng().map((byte, index) => (index === 45 ? byte ^ 1 : byte)),
      ),
    ]) {
      const upload = await storeBoundedUpload(storage, body(bytes), null);
      await expect(
        validateStoredUpload(storage, upload, {
          extension: "png",
          mediaType: "image/png",
        }),
      ).rejects.toBeInstanceOf(DocumentValidationError);
      await storage.removeQuarantine(upload.quarantineKey);
    }
  });

  it("rejects zero-byte, malformed, mismatched, and invalid UTF-8 content", async () => {
    const storage = await fixture();
    await expect(
      storeBoundedUpload(storage, body(Buffer.alloc(0)), "0"),
    ).rejects.toMatchObject({
      code: "EMPTY_FILE",
    });
    const malformedPdf = await storeBoundedUpload(
      storage,
      body(Buffer.from("%PDF-1.7\nmissing eof")),
      null,
    );
    await expect(
      validateStoredUpload(storage, malformedPdf, {
        extension: "pdf",
        mediaType: "application/pdf",
      }),
    ).rejects.toBeInstanceOf(DocumentValidationError);
    const invalidText = await storeBoundedUpload(
      storage,
      body(Buffer.from([0xc3, 0x28])),
      null,
    );
    await expect(
      validateStoredUpload(storage, invalidText, {
        extension: "txt",
        mediaType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(DocumentValidationError);
  });

  it("uses streamed bytes rather than Content-Length as authority", async () => {
    const storage = await fixture();
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(Buffer.alloc(1024 * 1024));
      },
    });
    await expect(
      storeBoundedUpload(storage, oversized, "1"),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("rejects missing, invalid-length, oversized, and aborted request bodies", async () => {
    const storage = await fixture();
    await expect(storeBoundedUpload(storage, null, null)).rejects.toMatchObject(
      {
        code: "INCOMPLETE_UPLOAD",
      },
    );
    await expect(
      storeBoundedUpload(storage, body(Buffer.from("fictional")), "unknown"),
    ).rejects.toMatchObject({ code: "INCOMPLETE_UPLOAD" });
    await expect(
      storeBoundedUpload(
        storage,
        body(Buffer.from("fictional")),
        String(MAX_DOCUMENT_SIZE_BYTES + 1),
      ),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    const aborted = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("partial"));
        controller.error(new Error("fictional transport abort"));
      },
    });
    await expect(
      storeBoundedUpload(storage, aborted, null),
    ).rejects.toMatchObject({ code: "INCOMPLETE_UPLOAD" });
  });
});
