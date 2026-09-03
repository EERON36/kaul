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
