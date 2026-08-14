import { z } from "zod";

import {
  parseCalendarDate,
  resolveStockholmDateTime,
} from "@/lib/stockholm-time";

export type FollowUpFormValues = Readonly<{
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
  responsibleUserId: string;
  goalId: string;
}>;

export type FollowUpFormFieldErrors = Partial<
  Record<keyof FollowUpFormValues, string>
>;

const followUpFormSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000),
    dueDate: z.string().refine((value) => parseCalendarDate(value) !== null),
    dueTime: z.union([
      z.literal(""),
      z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    ]),
    responsibleUserId: z.string().min(1),
    goalId: z.string(),
  })
  .superRefine((values, context) => {
    if (
      values.dueTime &&
      resolveStockholmDateTime(values.dueDate, values.dueTime) === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["dueTime"],
        message: "Ambiguous local time.",
      });
    }
  });

export function readFollowUpFormValues(formData: FormData): Readonly<{
  values: FollowUpFormValues;
  fieldErrors: FollowUpFormFieldErrors;
  input: Readonly<{
    title: string;
    description: string | null;
    dueDate: string;
    dueTime: string | null;
    responsibleUserId: string;
    goalId: string | null;
  }> | null;
}> {
  const values: FollowUpFormValues = {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    dueTime: String(formData.get("dueTime") ?? ""),
    responsibleUserId: String(formData.get("responsibleUserId") ?? ""),
    goalId: String(formData.get("goalId") ?? ""),
  };
  const parsed = followUpFormSchema.safeParse(values);
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
        dueDate: parsed.data.dueDate,
        dueTime: parsed.data.dueTime || null,
        responsibleUserId: parsed.data.responsibleUserId,
        goalId: parsed.data.goalId || null,
      },
    };
  }

  const fieldErrors: FollowUpFormFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "title") {
      fieldErrors.title =
        values.title.trim().length === 0
          ? "Ange en rubrik för uppföljningen."
          : "Rubriken får innehålla högst 200 tecken.";
    } else if (field === "description") {
      fieldErrors.description =
        "Beskrivningen får innehålla högst 20 000 tecken.";
    } else if (field === "dueDate") {
      fieldErrors.dueDate = "Ange ett giltigt datum för uppföljningen.";
    } else if (field === "dueTime") {
      fieldErrors.dueTime =
        "Tiden kan inte tolkas entydigt i svensk lokal tid. Kontrollera eller välj en annan tid.";
    } else if (field === "responsibleUserId") {
      fieldErrors.responsibleUserId = "Välj en ansvarig medarbetare.";
    }
  }
  return { values, fieldErrors, input: null };
}
