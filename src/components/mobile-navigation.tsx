"use client";

import { useId, useRef, useState } from "react";

import type {
  ApplicationNavigationItem,
  ApplicationNavigationPath,
  ApplicationShellContext,
} from "@/modules/users/application-shell";

import { LogoutButton } from "./authentication/logout-button";
import { NavigationGuardLink as Link } from "./navigation-guard";

type MobileNavigationProps = Readonly<{
  context: ApplicationShellContext;
  currentPath: ApplicationNavigationPath;
  activeClientCategory?: "ADULT" | "YOUTH" | "ALL";
  navigation: readonly ApplicationNavigationItem[];
}>;

export function MobileNavigation({
  context,
  currentPath,
  activeClientCategory,
  navigation,
}: MobileNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClientNavigationOpen, setIsClientNavigationOpen] = useState(
    currentPath === "/klienter",
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigationId = useId();
  const clientNavigationId = useId();

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
          {navigation.map((item) =>
            item.type === "link" ? (
              <Link
                aria-current={currentPath === item.href ? "page" : undefined}
                className="navigation-link"
                href={item.href}
                key={item.href}
                onNavigate={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <div
                className="navigation-group"
                data-context-active={currentPath === "/klienter"}
                key={item.label}
              >
                <button
                  aria-controls={clientNavigationId}
                  aria-expanded={isClientNavigationOpen}
                  className="navigation-group-toggle"
                  onClick={() => setIsClientNavigationOpen((open) => !open)}
                  type="button"
                >
                  <span>{item.label}</span>
                  <span aria-hidden="true">
                    {isClientNavigationOpen ? "−" : "+"}
                  </span>
                </button>
                <div
                  className="navigation-submenu"
                  hidden={!isClientNavigationOpen}
                  id={clientNavigationId}
                >
                  {item.children.map((child) => (
                    <Link
                      aria-current={
                        activeClientCategory === child.category
                          ? "page"
                          : undefined
                      }
                      className="navigation-link navigation-child-link"
                      href={child.href}
                      key={child.category}
                      onNavigate={() => setIsOpen(false)}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              </div>
            ),
          )}
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
