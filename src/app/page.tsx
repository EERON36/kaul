import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/authentication/logout-button";
import { EnvironmentNotice } from "@/components/environment-notice";
import { KaulWordmark } from "@/components/kaul-wordmark";
import {
  AuthenticationGuardError,
  requireApplicationUser,
} from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";
import { createApplicationShellContext } from "@/modules/users/application-shell";

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

  const context = createApplicationShellContext(user);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#huvudinnehall">
        Hoppa till huvudinnehåll
      </a>

      <aside className="sidebar">
        <KaulWordmark />
        <nav aria-label="Huvudnavigering">
          <Link aria-current="page" className="navigation-link" href="/">
            Hem
          </Link>
        </nav>
        <div className="signed-in-user">
          <p className="signed-in-name">{context.name}</p>
          <p>{context.professionalTitle}</p>
          <p>{context.roleLabel}</p>
          <LogoutButton />
        </div>
      </aside>

      <main className="main-content" id="huvudinnehall" tabIndex={-1}>
        <EnvironmentNotice />
        <div className="page-content">
          <p className="eyebrow">{context.organisationName}</p>
          <h1>Översikt</h1>
          <p className="introductory-text">Du är inloggad i Kaul.</p>
        </div>
      </main>
    </div>
  );
}
