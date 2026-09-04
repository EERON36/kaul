import { Readable } from "node:stream";

import { ZodError } from "zod";

import { AuditError } from "@/modules/audit/audit";
import { AuthenticationGuardError } from "@/modules/authentication/guards";
import { buildAttachmentContentDisposition } from "@/modules/documents/document-input";
import { authoriseDocumentDownload } from "@/modules/documents/documents";
import { DocumentError } from "@/modules/documents/documents-internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable(status = 404): Response {
  return new Response(null, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      clientId: string;
      documentId: string;
      versionId: string;
    }>;
  },
): Promise<Response> {
  try {
    const params = await context.params;
    const download = await authoriseDocumentDownload(params);
    const nodeStream = download.handle.createReadStream();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      void download.handle.close().catch(() => undefined);
    };
    nodeStream.once("end", close);
    nodeStream.once("error", close);
    nodeStream.once("close", close);
    const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 200,
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-disposition": buildAttachmentContentDisposition(
          download.displayFilename,
        ),
        "content-length": String(download.sizeBytes),
        "content-type": download.mediaType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (
      error instanceof ZodError ||
      error instanceof DocumentError ||
      error instanceof AuditError
    ) {
      return unavailable();
    }
    if (error instanceof AuthenticationGuardError) {
      return unavailable(401);
    }
    throw error;
  }
}
