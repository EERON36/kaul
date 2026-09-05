import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getApplicationNavigation } from "@/modules/users/application-shell";

import { MobileNavigation } from "./mobile-navigation";

const user = {
  userId: "fictional-user",
  name: "Fiktiv Medarbetare",
  email: "fictional@example.test",
  role: "STAFF_MEMBER" as const,
  organisationId: "fictional-organisation",
  organisationName: "Fiktiva Omsorgen",
  professionalTitle: "Fiktiv behandlare",
  mustChangePassword: false as const,
  credentialState: "APPLICATION_ALLOWED" as const,
};

const context = {
  name: user.name,
  professionalTitle: user.professionalTitle,
  organisationName: user.organisationName,
  roleLabel: "Medarbetare" as const,
};

describe("MobileNavigation", () => {
  it("starts with the Client group collapsed outside the Client context", () => {
    const markup = renderToStaticMarkup(
      createElement(MobileNavigation, {
        context,
        currentPath: "/",
        navigation: getApplicationNavigation(user),
      }),
    );

    expect(markup).toMatch(
      /aria-controls="[^"]+" aria-expanded="false" class="navigation-group-toggle"/,
    );
    expect(markup).toMatch(/class="navigation-submenu" hidden=""/);
  });

  it("exposes the active direct-link context through the expanded Client group", () => {
    const markup = renderToStaticMarkup(
      createElement(MobileNavigation, {
        activeClientCategory: "YOUTH",
        context,
        currentPath: "/klienter",
        navigation: getApplicationNavigation(user),
      }),
    );

    expect(markup).toMatch(/aria-expanded="true"[^>]*>[\s\S]*Klienter/);
    const controlsMatch = markup.match(
      /aria-controls="([^"]+)" aria-expanded="true" class="navigation-group-toggle"/,
    );
    expect(controlsMatch?.[1]).toBeTruthy();
    expect(markup).toContain(`id="${controlsMatch?.[1]}"`);
    expect(markup).toMatch(
      /aria-current="page"[^>]*href="\/klienter\?kategori=ungdomar"[^>]*>Ungdomar<\/a>/,
    );
    expect(markup).not.toMatch(
      /aria-current="page"[^>]*href="\/klienter"[^>]*>Vuxna<\/a>/,
    );
  });
});
