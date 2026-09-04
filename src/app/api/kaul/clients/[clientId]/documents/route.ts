import { ZodError } from "zod";

import { getEnvironment } from "@/lib/environment";
import { AuditError } from "@/modules/audit/audit";
import { AuthenticationGuardError } from "@/modules/authentication/guards";
import {
  DOCUMENT_METADATA_HEADER,
  parseUploadMetadataHeader,
} from "@/modules/documents/document-input";
import { DocumentValidationError } from "@/modules/documents/document-validation";
import { uploadDocument } from "@/modules/documents/documents";
import { DocumentError } from "@/modules/documents/documents-internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(code: string, status: number): Response {
  return Response.json(
    { code },
    {
      status,
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return (
      new URL(origin).origin ===
      new URL(getEnvironment().BETTER_AUTH_URL).origin
    );
  } catch {
    return false;
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof ZodError) return json("INVALID_INPUT", 400);
  if (error instanceof DocumentValidationError) {
    return json(
      error.code === "FILE_TOO_LARGE"
        ? "FILE_TOO_LARGE"
        : "FILE_VALIDATION_FAILED",
      error.code === "FILE_TOO_LARGE" ? 413 : 400,
    );
  }
  if (error instanceof DocumentError) {
    if (error.code === "TARGET_UNAVAILABLE") {
      return json("DOCUMENT_UPLOAD_FAILED", 404);
    }
    if (error.code === "SCAN_REJECTED") {
      return json("MALWARE_REJECTED", 422);
    }
    if (
      error.code === "SCANNER_UNAVAILABLE" ||
      error.code === "STORAGE_UNAVAILABLE"
    ) {
      return json("DOCUMENT_SERVICE_UNAVAILABLE", 503);
    }
    return json("DOCUMENT_UPLOAD_FAILED", 409);
  }
  if (error instanceof AuthenticationGuardError) {
    return json("DOCUMENT_UPLOAD_FAILED", 401);
  }
  if (error instanceof AuditError) {
    return json("DOCUMENT_UPLOAD_FAILED", 409);
  }
  throw error;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  if (!isTrustedOrigin(request)) return json("DOCUMENT_UPLOAD_FAILED", 403);
  try {
    const metadata = parseUploadMetadataHeader(
      request.headers.get(DOCUMENT_METADATA_HEADER),
    );
    const contentType = request.headers.get("content-type")?.toLowerCase();
    if (contentType !== metadata.declaredMediaType) {
      return json("FILE_VALIDATION_FAILED", 400);
    }
    const { clientId } = await context.params;
    const result = await uploadDocument({
      clientId,
      metadata,
      body: request.body,
      declaredContentLength: request.headers.get("content-length"),
    });
    return Response.json(result, {
      status: 201,
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
