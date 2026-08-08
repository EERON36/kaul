import "server-only";

import {
  AuthenticationGuardError,
  requireApplicationUser,
  type ApplicationUser,
} from "../authentication/guards";

export type AdministratorUser = ApplicationUser &
  Readonly<{ role: "ADMINISTRATOR" }>;

function isAdministrator(user: ApplicationUser): user is AdministratorUser {
  return user.role === "ADMINISTRATOR";
}

export async function requireAdministrator(): Promise<AdministratorUser> {
  const user = await requireApplicationUser();

  if (!isAdministrator(user)) {
    throw new AuthenticationGuardError("FORBIDDEN");
  }

  return user;
}
