import "server-only";

import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

import type { DocumentObjectHandle, DocumentStorage } from "./document-storage";
import {
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  type ApprovedDocumentType,
} from "./document-input";

export type DocumentValidationErrorCode =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "INCOMPLETE_UPLOAD"
  | "TYPE_MISMATCH"
  | "MALFORMED_FILE"
  | "IMAGE_DIMENSIONS_REJECTED";

export class DocumentValidationError extends Error {
  readonly code: DocumentValidationErrorCode;

  constructor(code: DocumentValidationErrorCode) {
    super("Document validation requirement not satisfied.");
    Object.defineProperty(this, "name", {
      value: "DocumentValidationError",
      configurable: true,
    });
    this.code = code;
  }
}

export type StoredUpload = Readonly<{
  quarantineKey: string;
  sizeBytes: number;
  sha256: string;
}>;

export async function storeBoundedUpload(
  storage: DocumentStorage,
  body: ReadableStream<Uint8Array> | null,
  declaredContentLength: string | null,
): Promise<StoredUpload> {
  if (!body) throw new DocumentValidationError("INCOMPLETE_UPLOAD");

  if (declaredContentLength !== null) {
    const length = Number(declaredContentLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new DocumentValidationError("INCOMPLETE_UPLOAD");
    }
    if (length > MAX_DOCUMENT_SIZE_BYTES) {
      throw new DocumentValidationError("FILE_TOO_LARGE");
    }
  }

  let sizeBytes = 0;
  const digest = createHash("sha256");
  const source = (async function* () {
    try {
      for await (const chunk of body) {
        sizeBytes += chunk.byteLength;
        if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
          throw new DocumentValidationError("FILE_TOO_LARGE");
        }
        digest.update(chunk);
        yield chunk;
      }
    } catch (error) {
      if (error instanceof DocumentValidationError) throw error;
      throw new DocumentValidationError("INCOMPLETE_UPLOAD");
    }
  })();

  let quarantineKey: string;
  try {
    quarantineKey = await storage.putQuarantine(source);
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    throw error;
  }

  if (sizeBytes === 0) {
    await storage.removeQuarantine(quarantineKey).catch(() => undefined);
    throw new DocumentValidationError("EMPTY_FILE");
  }

  return {
    quarantineKey,
    sizeBytes,
    sha256: digest.digest("hex"),
  };
}

async function readInspectionData(
  handle: DocumentObjectHandle,
  inspectText: boolean,
) {
  const maxHeadBytes = 1024 * 1024;
  const maxTailBytes = 4096;
  const headChunks: Uint8Array[] = [];
  let headSize = 0;
  let tail = Buffer.alloc(0);
  let total = 0;
  const decoder = inspectText
    ? new TextDecoder("utf-8", { fatal: true })
    : null;

  try {
    for await (const value of handle.createReadStream()) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      total += chunk.length;
      if (headSize < maxHeadBytes) {
        const part = chunk.subarray(0, maxHeadBytes - headSize);
        headChunks.push(part);
        headSize += part.length;
      }
      tail = Buffer.concat([tail, chunk]).subarray(-maxTailBytes);
      if (decoder) {
        const decoded = decoder.decode(chunk, { stream: true });
        if (decoded.includes("\u0000")) {
          throw new DocumentValidationError("MALFORMED_FILE");
        }
      }
    }
    decoder?.decode();
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    throw new DocumentValidationError("MALFORMED_FILE");
  }

  return {
    head: Buffer.concat(headChunks),
    tail,
    total,
  };
}

function requireImageDimensions(width: number, height: number): void {
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new DocumentValidationError("IMAGE_DIMENSIONS_REJECTED");
  }
}

function validatePdf(head: Buffer, tail: Buffer): void {
  if (
    head.length < 8 ||
    !head.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    !/^%PDF-[12]\.[0-9]/.test(head.subarray(0, 8).toString("ascii"))
  ) {
    throw new DocumentValidationError("TYPE_MISMATCH");
  }
  const tailText = tail.toString("latin1");
  const eof = tailText.lastIndexOf("%%EOF");
  if (
    eof < 0 ||
    !/^[\x00\x09\x0a\x0c\x0d\x20]*$/.test(tailText.slice(eof + 5))
  ) {
    throw new DocumentValidationError("MALFORMED_FILE");
  }
}

function validatePngHeader(head: Buffer): void {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (head.length < 33 || !head.subarray(0, 8).equals(signature)) {
    throw new DocumentValidationError("TYPE_MISMATCH");
  }
  if (
    head.readUInt32BE(8) !== 13 ||
    head.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new DocumentValidationError("MALFORMED_FILE");
  }
  const width = head.readUInt32BE(16);
  const height = head.readUInt32BE(20);
  requireImageDimensions(width, height);
  const bitDepth = head[24];
  const colourType = head[25];
  const validDepths: Record<number, readonly number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (
    bitDepth === undefined ||
    colourType === undefined ||
    !validDepths[colourType]?.includes(bitDepth) ||
    head[26] !== 0 ||
    head[27] !== 0 ||
    head[28] !== 0
  ) {
    throw new DocumentValidationError("MALFORMED_FILE");
  }
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function updateCrc32(crc: number, bytes: Uint8Array): number {
  let next = crc;
  for (const byte of bytes) {
    next = (crcTable[(next ^ byte) & 0xff] ?? 0) ^ (next >>> 8);
  }
  return next >>> 0;
}

async function validatePngStructure(
  handle: DocumentObjectHandle,
): Promise<void> {
  let buffer = Buffer.alloc(0);
  let signatureRead = false;
  let chunkNumber = 0;
  let current:
    | { type: string; remaining: number; crc: number; crcBytes: Buffer }
    | undefined;
  let sawIdat = false;
  let sawIend = false;

  function consume(): void {
    while (buffer.length > 0) {
      if (!signatureRead) {
        if (buffer.length < 8) return;
        const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (!buffer.subarray(0, 8).equals(signature)) {
          throw new DocumentValidationError("TYPE_MISMATCH");
        }
        buffer = buffer.subarray(8);
        signatureRead = true;
        continue;
      }
      if (!current) {
        if (buffer.length < 8) return;
        if (sawIend) throw new DocumentValidationError("MALFORMED_FILE");
        const length = buffer.readUInt32BE(0);
        const typeBytes = buffer.subarray(4, 8);
        const type = typeBytes.toString("ascii");
        if (!/^[A-Za-z]{4}$/.test(type) || length > MAX_DOCUMENT_SIZE_BYTES) {
          throw new DocumentValidationError("MALFORMED_FILE");
        }
        chunkNumber += 1;
        if (
          (chunkNumber === 1) !== (type === "IHDR") ||
          (type === "IHDR" && length !== 13)
        ) {
          throw new DocumentValidationError("MALFORMED_FILE");
        }
        if (type === "IDAT") sawIdat = true;
        if (type === "IEND" && (length !== 0 || !sawIdat)) {
          throw new DocumentValidationError("MALFORMED_FILE");
        }
        current = {
          type,
          remaining: length,
          crc: updateCrc32(0xffffffff, typeBytes),
          crcBytes: Buffer.alloc(0),
        };
        buffer = buffer.subarray(8);
        continue;
      }
      if (current.remaining > 0) {
        const count = Math.min(current.remaining, buffer.length);
        current.crc = updateCrc32(current.crc, buffer.subarray(0, count));
        current.remaining -= count;
        buffer = buffer.subarray(count);
        if (current.remaining > 0) return;
        continue;
      }
      const needed = 4 - current.crcBytes.length;
      const count = Math.min(needed, buffer.length);
      current.crcBytes = Buffer.concat([
        current.crcBytes,
        buffer.subarray(0, count),
      ]);
      buffer = buffer.subarray(count);
      if (current.crcBytes.length < 4) return;
      if (
        current.crcBytes.readUInt32BE(0) !==
        (current.crc ^ 0xffffffff) >>> 0
      ) {
        throw new DocumentValidationError("MALFORMED_FILE");
      }
      if (current.type === "IEND") sawIend = true;
      current = undefined;
    }
  }

  try {
    for await (const value of handle.createReadStream()) {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
      buffer = Buffer.concat([buffer, bytes]);
      consume();
    }
    consume();
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    throw new DocumentValidationError("MALFORMED_FILE");
  }
  if (!signatureRead || current || buffer.length > 0 || !sawIend) {
    throw new DocumentValidationError("MALFORMED_FILE");
  }
}

function validateJpeg(head: Buffer, tail: Buffer): void {
  if (head.length < 4 || head[0] !== 0xff || head[1] !== 0xd8) {
    throw new DocumentValidationError("TYPE_MISMATCH");
  }
  if (tail.length < 2 || tail.at(-2) !== 0xff || tail.at(-1) !== 0xd9) {
    throw new DocumentValidationError("MALFORMED_FILE");
  }
  let offset = 2;
  let sawStartOfFrame = false;
  while (offset + 4 <= head.length) {
    if (head[offset] !== 0xff) {
      throw new DocumentValidationError("MALFORMED_FILE");
    }
    while (head[offset] === 0xff) offset += 1;
    const marker = head[offset];
    offset += 1;
    if (marker === 0xd9) break;
    if (
      marker === 0x01 ||
      (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 2 > head.length) break;
    const length = head.readUInt16BE(offset);
    if (length < 2 || offset + length > head.length) break;
    if (marker === 0xda) {
      if (!sawStartOfFrame) {
        throw new DocumentValidationError("MALFORMED_FILE");
      }
      return;
    }
    const isStartOfFrame =
      marker !== undefined &&
      ((marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf));
    if (isStartOfFrame) {
      if (length < 7) throw new DocumentValidationError("MALFORMED_FILE");
      requireImageDimensions(
        head.readUInt16BE(offset + 5),
        head.readUInt16BE(offset + 3),
      );
      sawStartOfFrame = true;
    }
    offset += length;
  }
  throw new DocumentValidationError("MALFORMED_FILE");
}

export async function validateStoredUpload(
  storage: DocumentStorage,
  upload: StoredUpload,
  approvedType: ApprovedDocumentType,
): Promise<void> {
  const handle = await storage.openQuarantine(upload.quarantineKey);
  try {
    if (handle.size !== upload.sizeBytes) {
      throw new DocumentValidationError("INCOMPLETE_UPLOAD");
    }
    const { head, tail, total } = await readInspectionData(
      handle,
      approvedType.mediaType === "text/plain",
    );
    if (total !== upload.sizeBytes) {
      throw new DocumentValidationError("INCOMPLETE_UPLOAD");
    }
    switch (approvedType.mediaType) {
      case "application/pdf":
        validatePdf(head, tail);
        break;
      case "image/png":
        validatePngHeader(head);
        await validatePngStructure(handle);
        break;
      case "image/jpeg":
        validateJpeg(head, tail);
        break;
      case "text/plain":
        if (
          head.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
          head.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])) ||
          head
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ) {
          throw new DocumentValidationError("TYPE_MISMATCH");
        }
        break;
    }
  } finally {
    await handle.close();
  }
}
