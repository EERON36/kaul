export const formatJournalDateTime = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(date);

export const getJournalSignerRoleLabel = (
  role: "ADMINISTRATOR" | "STAFF_MEMBER" | null,
) => {
  if (role === "ADMINISTRATOR") return "Administratör";
  if (role === "STAFF_MEMBER") return "Medarbetare";
  return "Uppgift saknas";
};
