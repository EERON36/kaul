import { z } from "zod";

import { parseCalendarDate } from "@/lib/stockholm-time";

export type GoalFormValues = Readonly<{
  title: string;
  description: string;
  startDate: string;
  targetDate: string;
}>;

export type GoalFormFieldErrors = Partial<Record<keyof GoalFormValues, string>>;

const calendarDateSchema = z
  .string()
  .refine((value) => parseCalendarDate(value) !== null);

const goalFormSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000),
  startDate: calendarDateSchema,
  targetDate: z.union([z.literal(""), calendarDateSchema]),
});

export function readGoalFormValues(formData: FormData): Readonly<{
  values: GoalFormValues;
  fieldErrors: GoalFormFieldErrors;
  input: Readonly<{
    title: string;
    description: string | null;
    startDate: string;
    targetDate: string | null;
  }> | null;
}> {
  const values: GoalFormValues = {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    targetDate: String(formData.get("targetDate") ?? ""),
  };
  const parsed = goalFormSchema.safeParse(values);
  if (parsed.success) {
    return {
      values,
      fieldErrors: {},
      input: {
        title: parsed.data.title,
        description:
          parsed.data.description.trim().length > 0
            ? parsed.data.description
            : null,
        startDate: parsed.data.startDate,
        targetDate: parsed.data.targetDate || null,
      },
    };
  }

  const fieldErrors: GoalFormFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "title") {
      fieldErrors.title =
        values.title.trim().length === 0
          ? "Ange en rubrik för målet."
          : "Rubriken får innehålla högst 200 tecken.";
    } else if (field === "description") {
      fieldErrors.description =
        "Beskrivningen får innehålla högst 20 000 tecken.";
    } else if (field === "startDate") {
      fieldErrors.startDate = "Ange ett giltigt startdatum.";
    } else if (field === "targetDate") {
      fieldErrors.targetDate = "Ange ett giltigt måldatum eller lämna tomt.";
    }
  }
  return { values, fieldErrors, input: null };
}
