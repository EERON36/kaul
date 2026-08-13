import { z } from "zod";

import { auditOperationIdSchema } from "../audit/audit-vocabulary";
import {
  JOURNAL_CONTENT_MAX_LENGTH,
  JOURNAL_ENTRY_TYPE_VALUES,
} from "./journal-entry-type";

const internalUuidSchema = z.uuid();
const expectedVersionSchema = z.number().int().positive();

const journalContentSchema = z
  .string()
  .max(JOURNAL_CONTENT_MAX_LENGTH)
  .refine((value) => value.trim().length > 0, {
    message: "Journal content must not be empty.",
  });

const eventOccurredAtSchema = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

const editableJournalFieldsSchema = z.object({
  entryType: z.enum(JOURNAL_ENTRY_TYPE_VALUES),
  eventOccurredAt: eventOccurredAtSchema,
  content: journalContentSchema,
});

export const clientJournalQueryInputSchema = z
  .object({ clientId: internalUuidSchema })
  .strict();

export const journalEntryQueryInputSchema = z
  .object({ journalEntryId: internalUuidSchema })
  .strict();

export const createJournalDraftInputSchema = editableJournalFieldsSchema
  .extend({ clientId: internalUuidSchema })
  .strict();

export const saveJournalDraftInputSchema = editableJournalFieldsSchema
  .extend({
    journalEntryId: internalUuidSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();

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

export const beginJournalCorrectionInputSchema = editableJournalFieldsSchema
  .extend({ originalEntryId: internalUuidSchema })
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
