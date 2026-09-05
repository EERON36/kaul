import { z } from "zod";

export const STRUCTURED_CONTENT_MAX_LENGTH = 100_000;

export const STRUCTURED_SECTION_DEFINITIONS = [
  { key: "healthContent", label: "Hälsa" },
  {
    key: "educationOccupationContent",
    label: "Utbildning/Sysselsättning",
  },
  { key: "emotionsBehaviorContent", label: "Känslor och Beteende" },
  { key: "socialRelationsContent", label: "Sociala relationer" },
  {
    key: "dailyLivingIndependenceContent",
    label: "ADL/självständighet",
  },
  { key: "otherContent", label: "Övrigt" },
] as const;

export type StructuredSectionKey =
  (typeof STRUCTURED_SECTION_DEFINITIONS)[number]["key"];

export type StructuredSectionValues = Readonly<
  Record<StructuredSectionKey, string>
>;

const sectionSchema = z.string().max(STRUCTURED_CONTENT_MAX_LENGTH);

export const STRUCTURED_SECTION_SCHEMA_SHAPE = {
  healthContent: sectionSchema,
  educationOccupationContent: sectionSchema,
  emotionsBehaviorContent: sectionSchema,
  socialRelationsContent: sectionSchema,
  dailyLivingIndependenceContent: sectionSchema,
  otherContent: sectionSchema,
} as const;

export function hasMeaningfulStructuredContent(
  values: StructuredSectionValues,
): boolean {
  return STRUCTURED_SECTION_DEFINITIONS.some(
    ({ key }) => values[key].trim().length > 0,
  );
}

export function getStructuredContentLength(
  values: StructuredSectionValues,
): number {
  return STRUCTURED_SECTION_DEFINITIONS.reduce(
    (total, { key }) => total + values[key].length,
    0,
  );
}

export function addStructuredContentIssues(
  values: StructuredSectionValues,
  context: z.RefinementCtx,
  options: Readonly<{ requireMeaningfulContent: boolean }>,
): void {
  if (
    options.requireMeaningfulContent &&
    !hasMeaningfulStructuredContent(values)
  ) {
    context.addIssue({
      code: "custom",
      message: "At least one structured section must contain text.",
      path: ["otherContent"],
    });
  }

  if (getStructuredContentLength(values) > STRUCTURED_CONTENT_MAX_LENGTH) {
    context.addIssue({
      code: "custom",
      message: "The combined structured content is too long.",
      path: ["otherContent"],
    });
  }
}
