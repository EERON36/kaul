import type { ReactNode } from "react";

import type { ClientCategory } from "@/modules/clients/client-category";
import type { ApplicationUser } from "@/modules/authentication/guards";
import {
  createApplicationShellContext,
  getApplicationNavigation,
} from "@/modules/users/application-shell";

import { EnvironmentNotice } from "./environment-notice";
import { KaulWordmark } from "./kaul-wordmark";
import { MobileNavigation } from "./mobile-navigation";

type ApplicationShellProps = Readonly<{
  user: ApplicationUser;
  currentPath: "/" | "/klienter" | "/personal";
  activeClientCategory?: ClientCategory | "ALL";
  children: ReactNode;
}>;

export function ApplicationShell({
  user,
  currentPath,
  activeClientCategory,
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
        <MobileNavigation
          context={context}
          currentPath={currentPath}
          activeClientCategory={activeClientCategory}
          key={currentPath}
          navigation={navigation}
        />
      </aside>

      <main className="main-content" id="huvudinnehall" tabIndex={-1}>
        <EnvironmentNotice />
        {children}
      </main>
    </div>
  );
}
