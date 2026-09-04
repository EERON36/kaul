import { Buffer } from "node:buffer";

import { z } from "zod";

export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 20_000;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const DOCUMENT_METADATA_HEADER = "x-kaul-document-metadata";

const documentIdSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z
  .string()
  .trim()
  .max(2_000)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();
const originalFilenameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !value.includes("\u0000"), "Filename contains NUL.")
  .transform((value) => value.normalize("NFC").toWellFormed());

export const uploadMetadataSchema = z
  .object({
    operationId: z.uuid(),
    title: titleSchema,
    description: descriptionSchema,
    originalFilename: originalFilenameSchema,
    declaredMediaType: z.string().trim().toLowerCase().min(1).max(100),
  })
  .strict();

export const archiveDocumentInputSchema = z
  .object({
    operationId: z.uuid(),
    clientId: documentIdSchema,
    documentId: documentIdSchema,
  })
  .strict();

export const documentRouteIdentitySchema = z
  .object({
    clientId: documentIdSchema,
    documentId: documentIdSchema,
    versionId: documentIdSchema.optional(),
  })
  .strict();

export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;

export function parseUploadMetadataHeader(
  value: string | null,
): UploadMetadata {
  if (!value || value.length > 8_192) {
    throw new z.ZodError([
      {
        code: "custom",
        message: "Upload metadata is missing or too large.",
        path: [],
      },
    ]);
  }

  let decoded: unknown;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    decoded = JSON.parse(json);
  } catch {
    decoded = null;
  }

  return uploadMetadataSchema.parse(decoded);
}

const reservedWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function normalizeDisplayFilename(originalFilename: string): string {
  const normalized = originalFilename
    .normalize("NFC")
    .toWellFormed()
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  const nonEmpty = normalized || "dokument";
  const safe = reservedWindowsName.test(nonEmpty) ? `_${nonEmpty}` : nonEmpty;

  if (safe.length <= 180) return safe;

  const extensionIndex = safe.lastIndexOf(".");
  const extension =
    extensionIndex > 0 && safe.length - extensionIndex <= 10
      ? safe.slice(extensionIndex)
      : "";
  return `${safe.slice(0, 180 - extension.length)}${extension}`;
}

export type ApprovedDocumentType = Readonly<{
  extension: "pdf" | "jpg" | "jpeg" | "png" | "txt";
  mediaType: "application/pdf" | "image/jpeg" | "image/png" | "text/plain";
}>;

const approvedTypes = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  txt: "text/plain",
} as const;

export function requireApprovedDeclaredType(
  filename: string,
  declaredMediaType: string,
): ApprovedDocumentType {
  const dot = filename.lastIndexOf(".");
  const extension = (
    dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ""
  ) as keyof typeof approvedTypes;
  const mediaType = approvedTypes[extension];

  if (!mediaType || declaredMediaType.toLowerCase() !== mediaType) {
    throw new z.ZodError([
      {
        code: "custom",
        message: "Document type is not approved or does not match.",
        path: ["declaredMediaType"],
      },
    ]);
  }

  return { extension, mediaType };
}

export function buildAttachmentContentDisposition(
  displayFilename: string,
): string {
  const safeDisplayFilename = normalizeDisplayFilename(displayFilename);
  const ascii = safeDisplayFilename
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[\\"]/g, "_")
    .replace(/[\r\n]/g, "_");
  const fallback = ascii.length > 0 ? ascii : "dokument";
  const encoded = encodeURIComponent(safeDisplayFilename)
    .replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/%(7C|60|5E)/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
