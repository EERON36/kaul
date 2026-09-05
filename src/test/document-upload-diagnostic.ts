import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
const allowedApplicationCodes = new Set([
  "DOCUMENT_SERVICE_UNAVAILABLE",
  "DOCUMENT_UPLOAD_FAILED",
  "FILE_TOO_LARGE",
  "FILE_VALIDATION_FAILED",
  "INVALID_INPUT",
  "MALWARE_REJECTED",
]);

export type SafeDocumentUploadDiagnostic = Readonly<{
  httpStatus: number | null;
  applicationCode: string;
}>;

function allowedHttpStatus(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : null;
}

export function sanitizeDocumentUploadDiagnostic(
  status: unknown,
  payload: unknown,
): SafeDocumentUploadDiagnostic {
  const httpStatus = allowedHttpStatus(status);
  let applicationCode =
    httpStatus === null
      ? "NO_RESPONSE"
      : httpStatus === 201
        ? "UPLOAD_ACCEPTED"
        : "UNEXPECTED_RESPONSE";

  if (
    payload !== null &&
    typeof payload === "object" &&
    "code" in payload &&
    typeof payload.code === "string" &&
    allowedApplicationCodes.has(payload.code)
  ) {
    applicationCode = payload.code;
  }

  return { httpStatus, applicationCode };
}
export async function replaceDiagnosticFileAtomically(
  targetPath: string,
  contents: string,
  temporaryPath = `${targetPath}.${randomUUID()}.tmp`,
): Promise<void> {
  try {
    await writeFile(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
