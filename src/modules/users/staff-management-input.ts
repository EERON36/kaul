import { z } from "zod";

import { auditOperationIdSchema } from "../audit/audit-vocabulary";

export const createStaffMemberInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().max(254).pipe(z.email()),
    professionalTitle: z.string().trim().min(1).max(120),
  })
  .strict();

export const staffMemberStatusInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    targetUserId: z.string().trim().min(1).max(200),
  })
  .strict();

export const staffPasswordResetInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    targetUserId: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateStaffMemberInput = z.infer<
  typeof createStaffMemberInputSchema
>;
export type StaffMemberStatusInput = z.infer<
  typeof staffMemberStatusInputSchema
>;
export type StaffPasswordResetInput = z.infer<
  typeof staffPasswordResetInputSchema
>;
