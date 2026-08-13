const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

const stockholmDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: STOCKHOLM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type LocalDateParts = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

type LocalDateTimeParts = LocalDateParts &
  Readonly<{ hour: number; minute: number; second: number }>;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function getStockholmParts(date: Date): LocalDateTimeParts {
  const parts = Object.fromEntries(
    stockholmDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function parseLocalDate(value: string): LocalDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return check.getUTCFullYear() === parts.year &&
    check.getUTCMonth() + 1 === parts.month &&
    check.getUTCDate() === parts.day
    ? parts
    : null;
}

function parseLocalTime(value: string): Readonly<{
  hour: number;
  minute: number;
}> | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

export function parseCalendarDate(value: string): Date | null {
  const parts = parseLocalDate(value);
  return parts
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    : null;
}

export function formatCalendarDate(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export function formatStockholmCalendarDate(value: Date): string {
  const parts = getStockholmParts(value);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseCalendarDate(value);
  if (!date) throw new Error("Invalid calendar date.");
  date.setUTCDate(date.getUTCDate() + days);
  return formatCalendarDate(date);
}

export function resolveStockholmDateTime(
  localDate: string,
  localTime: string,
): Date | null {
  const date = parseLocalDate(localDate);
  const time = parseLocalTime(localTime);
  if (!date || !time) return null;

  const localAsUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
  );
  const matches: Date[] = [];

  for (
    let offsetMinutes = -14 * 60;
    offsetMinutes <= 14 * 60;
    offsetMinutes += 15
  ) {
    const candidate = new Date(localAsUtc - offsetMinutes * 60_000);
    const actual = getStockholmParts(candidate);
    if (
      actual.year === date.year &&
      actual.month === date.month &&
      actual.day === date.day &&
      actual.hour === time.hour &&
      actual.minute === time.minute
    ) {
      matches.push(candidate);
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

export type FollowUpDueState =
  "OVERDUE" | "DUE_TODAY" | "UPCOMING" | "OUTSIDE_WINDOW";

export function getFollowUpDueState(
  followUp: Readonly<{
    dueDate: Date;
    dueAt: Date | null;
  }>,
  now: Date,
): FollowUpDueState {
  const dueDate = formatCalendarDate(followUp.dueDate);
  const today = formatStockholmCalendarDate(now);

  if (dueDate < today) return "OVERDUE";
  if (dueDate === today) {
    return followUp.dueAt && now.getTime() > followUp.dueAt.getTime()
      ? "OVERDUE"
      : "DUE_TODAY";
  }
  return dueDate <= addCalendarDays(today, 7) ? "UPCOMING" : "OUTSIDE_WINDOW";
}
