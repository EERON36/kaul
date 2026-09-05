import { z } from "zod";

import {
  addStructuredContentIssues,
  STRUCTURED_SECTION_SCHEMA_SHAPE,
  type StructuredSectionValues,
} from "../../lib/structured-sections";
import { auditOperationIdSchema } from "../audit/audit-vocabulary";

const internalUuidSchema = z.uuid();
const expectedVersionSchema = z.number().int().positive();
const calendarYearSchema = z.number().int().min(1900).max(9999);
const calendarMonthSchema = z.number().int().min(1).max(12);

const monthlyReportMonthShape = {
  clientId: internalUuidSchema,
  calendarYear: calendarYearSchema,
  calendarMonth: calendarMonthSchema,
} as const;

export const clientMonthlyReportsQueryInputSchema = z
  .object({ clientId: internalUuidSchema })
  .strict();

export const monthlyReportQueryInputSchema = z
  .object({ monthlyReportId: internalUuidSchema })
  .strict();

export const createMonthlyReportDraftInputSchema = z
  .object(monthlyReportMonthShape)
  .strict();

export const saveMonthlyReportDraftInputSchema = z
  .object({
    monthlyReportId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
    ...STRUCTURED_SECTION_SCHEMA_SHAPE,
  })
  .strict()
  .superRefine((value, context) =>
    addStructuredContentIssues(value as StructuredSectionValues, context, {
      requireMeaningfulContent: false,
    }),
  );

export const signMonthlyReportDraftInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    monthlyReportId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();

export const beginMonthlyReportReplacementInputSchema = z
  .object({ monthlyReportId: internalUuidSchema })
  .strict();

export type ClientMonthlyReportsQueryInput = z.input<
  typeof clientMonthlyReportsQueryInputSchema
>;
export type MonthlyReportQueryInput = z.input<
  typeof monthlyReportQueryInputSchema
>;
export type CreateMonthlyReportDraftInput = z.input<
  typeof createMonthlyReportDraftInputSchema
>;
export type SaveMonthlyReportDraftInput = z.input<
  typeof saveMonthlyReportDraftInputSchema
>;
export type SignMonthlyReportDraftInput = z.input<
  typeof signMonthlyReportDraftInputSchema
>;
export type BeginMonthlyReportReplacementInput = z.input<
  typeof beginMonthlyReportReplacementInputSchema
>;
