import { z } from "zod";

import { AssignmentResponsibility } from "../../generated/prisma/enums";
import { auditOperationIdSchema } from "../audit/audit-vocabulary";
import { CLIENT_CATEGORY_VALUES } from "./client-category";

const internalUuidSchema = z.uuid();

export function canonicalizePersonIdentifier(value: string): string {
  return value.trim().normalize("NFC").toUpperCase();
}

export const createClientInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    personIdentifier: z
      .string()
      .transform(canonicalizePersonIdentifier)
      .pipe(z.string().min(1).max(64)),
    category: z.string().trim().pipe(z.enum(CLIENT_CATEGORY_VALUES)),
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
export type CreateAssignmentInput = z.input<typeof createAssignmentInputSchema>;
export type EndAssignmentInput = z.input<typeof endAssignmentInputSchema>;
