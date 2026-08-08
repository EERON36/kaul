import type { ApplicationUser } from "../authentication/guards";

export type ApplicationShellContext = Readonly<{
  name: string;
  professionalTitle: string;
  organisationName: string;
  roleLabel: "Administratör" | "Medarbetare";
}>;

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
