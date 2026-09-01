import { z } from "zod";

import { AssignmentResponsibility } from "../../generated/prisma/enums";
import { auditOperationIdSchema } from "../audit/audit-vocabulary";
import { CLIENT_CATEGORY_VALUES } from "./client-category";

const internalUuidSchema = z.uuid();

export const CLIENT_SEARCH_MAX_LENGTH = 100;

function normalizeOptionalText(value: string): string {
  return value.trim().normalize("NFC");
}

function optionalBoundedText(maxLength: number) {
  return z
    .string()
    .optional()
    .default("")
    .transform(normalizeOptionalText)
    .pipe(z.string().max(maxLength))
    .transform((value) => (value.length === 0 ? null : value));
}

const optionalPersonalIdentityNumberSchema = z
  .string()
  .optional()
  .default("")
  .transform(normalizeOptionalText)
  .pipe(
    z
      .string()
      .max(32)
      .refine((value) => value === "" || /^[0-9+\-\s]+$/u.test(value), {
        message: "Personal identity number contains unsupported characters.",
      }),
  )
  .transform((value) => (value.length === 0 ? null : value));

const optionalEmailSchema = z
  .string()
  .optional()
  .default("")
  .transform(normalizeOptionalText)
  .pipe(
    z
      .string()
      .max(254)
      .refine((value) => value === "" || z.email().safeParse(value).success, {
        message: "Email address is invalid.",
      }),
  )
  .transform((value) => (value.length === 0 ? null : value));

const optionalClientInformationShape = {
  personalIdentityNumber: optionalPersonalIdentityNumberSchema,
  placingUnit: optionalBoundedText(200),
  legalBasis: optionalBoundedText(200),
  responsibleSocialWorkerName: optionalBoundedText(200),
  responsibleSocialWorkerPhone: optionalBoundedText(50),
  responsibleSocialWorkerEmail: optionalEmailSchema,
} as const;

export function canonicalizePersonIdentifier(value: string): string {
  return value.trim().normalize("NFC").toUpperCase();
}

export function normalizeClientSearchQuery(value: string): string {
  return value.trim().normalize("NFC");
}

export const clientSearchInputSchema = z
  .string()
  .transform(normalizeClientSearchQuery)
  .pipe(z.string().max(CLIENT_SEARCH_MAX_LENGTH));

export const createClientInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    personIdentifier: z
      .string()
      .transform(canonicalizePersonIdentifier)
      .pipe(z.string().min(1).max(64)),
    ...optionalClientInformationShape,
    category: z.string().trim().pipe(z.enum(CLIENT_CATEGORY_VALUES)),
  })
  .strict();

export const updateClientInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    clientId: internalUuidSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    personIdentifier: z
      .string()
      .transform(canonicalizePersonIdentifier)
      .pipe(z.string().min(1).max(64)),
    ...optionalClientInformationShape,
    category: z.string().trim().pipe(z.enum(CLIENT_CATEGORY_VALUES)),
  })
  .strict();

export const archiveClientInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    clientId: internalUuidSchema,
  })
  .strict();

export const createAssignmentInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    clientId: internalUuidSchema,
    staffUserId: z.string().trim().min(1).max(200),
    responsibility: z.enum(AssignmentResponsibility),
  })
  .strict();

export const endAssignmentInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    assignmentId: internalUuidSchema,
  })
  .strict();

export type CreateClientInput = z.input<typeof createClientInputSchema>;
export type ClientSearchInput = z.input<typeof clientSearchInputSchema>;
export type NormalizedClientSearchQuery = z.output<
  typeof clientSearchInputSchema
>;
export type UpdateClientInput = z.input<typeof updateClientInputSchema>;
export type ArchiveClientInput = z.input<typeof archiveClientInputSchema>;
export type CreateAssignmentInput = z.input<typeof createAssignmentInputSchema>;
export type EndAssignmentInput = z.input<typeof endAssignmentInputSchema>;
