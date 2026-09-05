import type { ApplicationUser } from "../authentication/guards";

export type ApplicationShellContext = Readonly<{
  name: string;
  professionalTitle: string;
  organisationName: string;
  roleLabel: "Administratör" | "Medarbetare";
}>;

export type ApplicationNavigationPath = "/" | "/klienter" | "/personal";

export type ApplicationNavigationItem =
  | Readonly<{
      type: "link";
      href: "/" | "/personal";
      label: "Hem" | "Personal";
    }>
  | Readonly<{
      type: "group";
      label: "Klienter";
      children: readonly Readonly<{
        category: "ADULT" | "YOUTH";
        href: "/klienter" | "/klienter?kategori=ungdomar";
        label: "Vuxna" | "Ungdomar";
      }>[];
    }>;

export function getApplicationNavigation(
  user: ApplicationUser,
): readonly ApplicationNavigationItem[] {
  const shared: ApplicationNavigationItem[] = [
    { type: "link", href: "/", label: "Hem" },
    {
      type: "group",
      label: "Klienter",
      children: [
        { category: "ADULT", href: "/klienter", label: "Vuxna" },
        {
          category: "YOUTH",
          href: "/klienter?kategori=ungdomar",
          label: "Ungdomar",
        },
      ],
    },
  ];

  return user.role === "ADMINISTRATOR"
    ? [...shared, { type: "link", href: "/personal", label: "Personal" }]
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
