import { z } from "zod";

import {
  parseCalendarDate,
  resolveStockholmDateTime,
} from "../../lib/stockholm-time";
import { auditOperationIdSchema } from "../audit/audit-vocabulary";

export const PLANNING_TITLE_MAX_LENGTH = 200;
export const PLANNING_DESCRIPTION_MAX_LENGTH = 20_000;

const internalUuidSchema = z.uuid();
const expectedVersionSchema = z.number().int().positive();
const titleSchema = z.string().trim().min(1).max(PLANNING_TITLE_MAX_LENGTH);
const descriptionSchema = z
  .string()
  .max(PLANNING_DESCRIPTION_MAX_LENGTH)
  .transform((value) => (value.trim().length === 0 ? null : value))
  .nullable();
const calendarDateSchema = z
  .string()
  .refine((value) => parseCalendarDate(value) !== null, {
    message: "Invalid calendar date.",
  });
const optionalCalendarDateSchema = calendarDateSchema.nullable();
const dueTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();

const goalEditableFieldsSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  startDate: calendarDateSchema,
  targetDate: optionalCalendarDateSchema,
});

const followUpEditableFieldsSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    dueDate: calendarDateSchema,
    dueTime: dueTimeSchema,
    goalId: internalUuidSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.dueTime !== null &&
      resolveStockholmDateTime(value.dueDate, value.dueTime) === null
    ) {
      context.addIssue({
        code: "custom",
        message: "Due time is not unambiguous in Europe/Stockholm.",
        path: ["dueTime"],
      });
    }
  });

export const clientPlanningQueryInputSchema = z
  .object({ clientId: internalUuidSchema })
  .strict();
export const goalQueryInputSchema = z
  .object({ goalId: internalUuidSchema })
  .strict();
export const followUpQueryInputSchema = z
  .object({ followUpId: internalUuidSchema })
  .strict();

export const createGoalInputSchema = goalEditableFieldsSchema
  .extend({ clientId: internalUuidSchema })
  .strict();
export const updateGoalInputSchema = goalEditableFieldsSchema
  .extend({
    goalId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();
export const goalVersionInputSchema = z
  .object({
    goalId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();
export const auditedGoalTransitionInputSchema = goalVersionInputSchema
  .extend({ operationId: auditOperationIdSchema })
  .strict();

export const createFollowUpInputSchema = followUpEditableFieldsSchema
  .extend({
    clientId: internalUuidSchema,
    responsibleUserId: z.string().min(1),
  })
  .strict();
export const updateFollowUpInputSchema = followUpEditableFieldsSchema
  .extend({
    followUpId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();
export const reassignFollowUpInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    followUpId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
    responsibleUserId: z.string().min(1),
  })
  .strict();
export const auditedFollowUpTransitionInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    followUpId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();

export type ClientPlanningQueryInput = z.input<
  typeof clientPlanningQueryInputSchema
>;
export type GoalQueryInput = z.input<typeof goalQueryInputSchema>;
export type FollowUpQueryInput = z.input<typeof followUpQueryInputSchema>;
export type CreateGoalInput = z.input<typeof createGoalInputSchema>;
export type UpdateGoalInput = z.input<typeof updateGoalInputSchema>;
export type GoalVersionInput = z.input<typeof goalVersionInputSchema>;
export type AuditedGoalTransitionInput = z.input<
  typeof auditedGoalTransitionInputSchema
>;
export type CreateFollowUpInput = z.input<typeof createFollowUpInputSchema>;
export type UpdateFollowUpInput = z.input<typeof updateFollowUpInputSchema>;
export type ReassignFollowUpInput = z.input<typeof reassignFollowUpInputSchema>;
export type AuditedFollowUpTransitionInput = z.input<
  typeof auditedFollowUpTransitionInputSchema
>;
