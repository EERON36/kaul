import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import {
  AuthenticationGuardError,
  requireApplicationUser,
} from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";

export const dynamic = "force-dynamic";

export default async function Home() {
  let user;

  try {
    user = await requireApplicationUser();
  } catch (error) {
    if (error instanceof AuthenticationGuardError) {
      const destination = getApplicationErrorRedirect(error.code);

      if (destination) {
        redirect(destination);
      }
    }

    throw error;
  }

  return (
    <ApplicationShell currentPath="/" user={user}>
      <div className="page-content">
        <p className="eyebrow">{user.organisationName}</p>
        <h1>Översikt</h1>
        <p className="introductory-text">Du är inloggad i Kaul.</p>
      </div>
    </ApplicationShell>
  );
}
