import Link from "next/link";
import type { ReactNode } from "react";

import type { ApplicationUser } from "@/modules/authentication/guards";
import { createApplicationShellContext } from "@/modules/users/application-shell";

import { LogoutButton } from "./authentication/logout-button";
import { EnvironmentNotice } from "./environment-notice";
import { KaulWordmark } from "./kaul-wordmark";

type ApplicationShellProps = Readonly<{
  user: ApplicationUser;
  currentPath: "/" | "/personal";
  children: ReactNode;
}>;

export function ApplicationShell({
  user,
  currentPath,
  children,
}: ApplicationShellProps) {
  const context = createApplicationShellContext(user);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#huvudinnehall">
        Hoppa till huvudinnehåll
      </a>

      <aside className="sidebar">
        <KaulWordmark />
        <nav aria-label="Huvudnavigering">
          <Link
            aria-current={currentPath === "/" ? "page" : undefined}
            className="navigation-link"
            href="/"
          >
            Hem
          </Link>
          {user.role === "ADMINISTRATOR" ? (
            <Link
              aria-current={currentPath === "/personal" ? "page" : undefined}
              className="navigation-link"
              href="/personal"
            >
              Personal
            </Link>
          ) : null}
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
        {children}
      </main>
    </div>
  );
}
