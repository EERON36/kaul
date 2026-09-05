import "server-only";

import { isAbsolute, resolve } from "node:path";

import { z } from "zod";

const documentEnvironmentSchema = z
  .object({
    DOCUMENT_STORAGE_ROOT: z
      .string()
      .min(1)
      .refine(isAbsolute, "DOCUMENT_STORAGE_ROOT must be an absolute path.")
      .transform((value) => resolve(value)),
    DOCUMENT_SCANNER_HOST: z.string().trim().min(1),
    DOCUMENT_SCANNER_PORT: z.coerce.number().int().min(1).max(65_535),
    DOCUMENT_SCANNER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000),
    DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: z.coerce.number().positive().max(24),
  })
  .strict();

export type DocumentEnvironment = z.infer<typeof documentEnvironmentSchema>;

let cachedDocumentEnvironment: DocumentEnvironment | undefined;

export function parseDocumentEnvironment(
  values: NodeJS.ProcessEnv | Record<string, string | undefined>,
): DocumentEnvironment {
  const input = {
    DOCUMENT_STORAGE_ROOT: values.DOCUMENT_STORAGE_ROOT,
    DOCUMENT_SCANNER_HOST: values.DOCUMENT_SCANNER_HOST,
    DOCUMENT_SCANNER_PORT: values.DOCUMENT_SCANNER_PORT,
    DOCUMENT_SCANNER_TIMEOUT_MS: values.DOCUMENT_SCANNER_TIMEOUT_MS,
    DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS:
      values.DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS,
  };
  const result = documentEnvironmentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid Documents configuration: ${details}`);
  }
  return result.data;
}

export function getDocumentEnvironment(): DocumentEnvironment {
  cachedDocumentEnvironment ??= parseDocumentEnvironment(process.env);
  return cachedDocumentEnvironment;
}
