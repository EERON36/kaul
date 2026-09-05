import { z } from "zod";

import { auditOperationIdSchema } from "../audit/audit-vocabulary";
import {
  addStructuredContentIssues,
  STRUCTURED_SECTION_SCHEMA_SHAPE,
  type StructuredSectionValues,
} from "../../lib/structured-sections";
import { JOURNAL_ENTRY_TYPE_VALUES } from "./journal-entry-type";

const internalUuidSchema = z.uuid();
const expectedVersionSchema = z.number().int().positive();

const eventOccurredAtSchema = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

const editableJournalFieldsShape = {
  entryType: z.enum(JOURNAL_ENTRY_TYPE_VALUES),
  eventOccurredAt: eventOccurredAtSchema,
} as const;

function requireStructuredJournalContent(
  value: StructuredSectionValues,
  context: z.RefinementCtx,
) {
  addStructuredContentIssues(value, context, {
    requireMeaningfulContent: true,
  });
}

export const clientJournalQueryInputSchema = z
  .object({ clientId: internalUuidSchema })
  .strict();

export const journalEntryQueryInputSchema = z
  .object({ journalEntryId: internalUuidSchema })
  .strict();

const structuredJournalFieldsShape = {
  ...editableJournalFieldsShape,
  ...STRUCTURED_SECTION_SCHEMA_SHAPE,
} as const;

export const createJournalDraftInputSchema = z
  .object({ ...structuredJournalFieldsShape, clientId: internalUuidSchema })
  .strict()
  .superRefine(requireStructuredJournalContent);

export const saveJournalDraftInputSchema = z
  .object({
    ...structuredJournalFieldsShape,
    journalEntryId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict()
  .superRefine(requireStructuredJournalContent);

export const discardJournalDraftInputSchema = z
  .object({
    journalEntryId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();

export const signJournalDraftInputSchema = z
  .object({
    operationId: auditOperationIdSchema,
    journalEntryId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();

export const beginJournalCorrectionInputSchema = z
  .object({
    ...structuredJournalFieldsShape,
    originalEntryId: internalUuidSchema,
  })
  .strict()
  .superRefine(requireStructuredJournalContent);

export const replaceJournalDraftGoalsInputSchema = z
  .object({
    journalEntryId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
    goalIds: z
      .array(internalUuidSchema)
      .max(100)
      .refine((values) => new Set(values).size === values.length, {
        message: "Goal identifiers must be unique.",
      }),
  })
  .strict();

export type ClientJournalQueryInput = z.input<
  typeof clientJournalQueryInputSchema
>;
export type JournalEntryQueryInput = z.input<
  typeof journalEntryQueryInputSchema
>;
export type CreateJournalDraftInput = z.input<
  typeof createJournalDraftInputSchema
>;
export type SaveJournalDraftInput = z.input<typeof saveJournalDraftInputSchema>;
export type DiscardJournalDraftInput = z.input<
  typeof discardJournalDraftInputSchema
>;
export type SignJournalDraftInput = z.input<typeof signJournalDraftInputSchema>;
export type BeginJournalCorrectionInput = z.input<
  typeof beginJournalCorrectionInputSchema
>;
export type ReplaceJournalDraftGoalsInput = z.input<
  typeof replaceJournalDraftGoalsInputSchema
>;
