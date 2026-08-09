import type { ApplicationUser } from "../authentication/guards";

export type ApplicationShellContext = Readonly<{
  name: string;
  professionalTitle: string;
  organisationName: string;
  roleLabel: "Administratör" | "Medarbetare";
}>;

export type ApplicationNavigationItem = Readonly<{
  href: "/" | "/klienter" | "/personal";
  label: "Hem" | "Klienter" | "Personal";
}>;

export function getApplicationNavigation(
  user: ApplicationUser,
): readonly ApplicationNavigationItem[] {
  const shared: ApplicationNavigationItem[] = [
    { href: "/", label: "Hem" },
    { href: "/klienter", label: "Klienter" },
  ];

  return user.role === "ADMINISTRATOR"
    ? [...shared, { href: "/personal", label: "Personal" }]
    : shared;
}

export function createApplicationShellContext(
  user: ApplicationUser,
): ApplicationShellContext {
  return {
    name: user.name,
    professionalTitle: user.professionalTitle,
    organisationName: user.organisationName,
    roleLabel: user.role === "ADMINISTRATOR" ? "Administratör" : "Medarbetare",
  };
}
