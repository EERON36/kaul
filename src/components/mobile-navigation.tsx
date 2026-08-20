"use client";

import { useId, useRef, useState } from "react";

import type {
  ApplicationNavigationItem,
  ApplicationShellContext,
} from "@/modules/users/application-shell";

import { LogoutButton } from "./authentication/logout-button";
import { NavigationGuardLink as Link } from "./navigation-guard";

type MobileNavigationProps = Readonly<{
  context: ApplicationShellContext;
  currentPath: ApplicationNavigationItem["href"];
  navigation: readonly ApplicationNavigationItem[];
}>;

export function MobileNavigation({
  context,
  currentPath,
  navigation,
}: MobileNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigationId = useId();

  function closeNavigation() {
    setIsOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div
      className="mobile-navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          closeNavigation();
        }
      }}
    >
      <button
        aria-controls={navigationId}
        aria-expanded={isOpen}
        className="mobile-menu-button"
        onClick={() => setIsOpen((open) => !open)}
        ref={buttonRef}
        type="button"
      >
        {isOpen ? "Stäng meny" : "Öppna meny"}
      </button>
      <div
        className="mobile-navigation-panel"
        data-open={isOpen}
        id={navigationId}
      >
        <nav aria-label="Huvudnavigering">
          {navigation.map((item) => (
            <Link
              aria-current={currentPath === item.href ? "page" : undefined}
              className="navigation-link"
              href={item.href}
              key={item.href}
              onClick={() => setIsOpen(false)}
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
      </div>
    </div>
  );
}
