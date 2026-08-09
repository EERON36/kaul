import Link from "next/link";
import type { ReactNode } from "react";

import type { ApplicationUser } from "@/modules/authentication/guards";
import {
  createApplicationShellContext,
  getApplicationNavigation,
} from "@/modules/users/application-shell";

import { LogoutButton } from "./authentication/logout-button";
import { EnvironmentNotice } from "./environment-notice";
import { KaulWordmark } from "./kaul-wordmark";

type ApplicationShellProps = Readonly<{
  user: ApplicationUser;
  currentPath: "/" | "/klienter" | "/personal";
  children: ReactNode;
}>;

export function ApplicationShell({
  user,
  currentPath,
  children,
}: ApplicationShellProps) {
  const context = createApplicationShellContext(user);
  const navigation = getApplicationNavigation(user);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#huvudinnehall">
        Hoppa till huvudinnehåll
      </a>

      <aside className="sidebar">
        <KaulWordmark />
        <nav aria-label="Huvudnavigering">
          {navigation.map((item) => (
            <Link
              aria-current={currentPath === item.href ? "page" : undefined}
              className="navigation-link"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
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
