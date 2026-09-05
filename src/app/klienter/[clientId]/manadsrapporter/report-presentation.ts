export function formatMonthlyReportMonth(
  calendarYear: number,
  calendarMonth: number,
): string {
  const month = new Intl.DateTimeFormat("sv-SE", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Stockholm",
  }).format(new Date(Date.UTC(calendarYear, calendarMonth - 1, 1)));
  return month.charAt(0).toUpperCase() + month.slice(1);
}

export function formatMonthlyReportDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(date);
}

export function getMonthlyReportSignerSnapshot(
  professionalTitle: string | null,
  role: "ADMINISTRATOR" | "STAFF_MEMBER" | null,
) {
  return [
    {
      label: "Titel vid signering",
      value: professionalTitle?.trim() || "Uppgift saknas",
    },
    {
      label: "Roll vid signering",
      value:
        role === "ADMINISTRATOR"
          ? "Administratör"
          : role === "STAFF_MEMBER"
            ? "Medarbetare"
            : "Uppgift saknas",
    },
  ] as const;
}
