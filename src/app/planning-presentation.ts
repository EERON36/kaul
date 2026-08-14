import {
  formatCalendarDate,
  getFollowUpDueState,
  type FollowUpDueState,
} from "@/lib/stockholm-time";

export const goalStatusLabels = {
  ACTIVE: "Aktivt",
  PAUSED: "Pausat",
  COMPLETED: "Slutfört",
  ARCHIVED: "Arkiverat",
} as const;

export const followUpStatusLabels = {
  PLANNED: "Planerad",
  COMPLETED: "Slutförd",
  CANCELLED: "Avbruten",
} as const;

export const followUpDueStateLabels = {
  OVERDUE: "Försenad",
  DUE_TODAY: "Idag",
  UPCOMING: "Kommande",
  OUTSIDE_WINDOW: "Planerad",
} as const satisfies Record<FollowUpDueState, string>;

const planningDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "long",
  timeZone: "UTC",
});

const planningDateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

export function formatPlanningDate(date: Date): string {
  return planningDateFormatter.format(date);
}

export function formatPlanningDateTime(date: Date): string {
  return planningDateTimeFormatter.format(date);
}

export function formatPlanningDateInput(date: Date): string {
  return formatCalendarDate(date);
}

export function getFollowUpDuePresentation(
  followUp: Readonly<{
    dueDate: Date;
    dueTime: string | null;
    dueAt: Date | null;
  }>,
  now = new Date(),
): Readonly<{ state: FollowUpDueState; label: string; value: string }> {
  const state = getFollowUpDueState(followUp, now);
  return {
    state,
    label: followUpDueStateLabels[state],
    value: `${formatPlanningDate(followUp.dueDate)}${followUp.dueTime ? ` kl. ${followUp.dueTime}` : ""}`,
  };
}
