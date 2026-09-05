import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NavigationGuardProvider } from "@/components/navigation-guard";

vi.mock("../actions", () => ({ updateClientAction: vi.fn() }));

import { areClientEditFormValuesEqual, ClientEdit } from "./client-edit-client";

const TestNavigationGuardProvider = NavigationGuardProvider as ComponentType<{
  children?: ReactNode;
  confirmationMessage: string;
}>;

describe("Client edit dirty state", () => {
  const initialValues = {
    firstName: "Fiktiv",
    lastName: "Klient",
    personIdentifier: "FIKTIV-01",
    category: "ADULT",
    personalIdentityNumber: "",
    placingUnit: "Fiktiv enhet",
    legalBasis: "Fiktivt lagrum",
    responsibleSocialWorkerName: "Fiktiv handläggare",
    responsibleSocialWorkerPhone: "070-000 00 00",
    responsibleSocialWorkerEmail: "handlaggare@example.test",
  };

  it("keeps cancel clean when every field matches the opening values", () => {
    expect(areClientEditFormValuesEqual(initialValues, initialValues)).toBe(
      true,
    );
  });

  it("renders the editable form inside the existing navigation-guard context", () => {
    const html = renderToStaticMarkup(
      createElement(
        TestNavigationGuardProvider,
        { confirmationMessage: "Fiktiv varning." },
        createElement(ClientEdit, {
          client: {
            id: "123e4567-e89b-42d3-a456-426614174001",
            ...initialValues,
          },
          operationId: "123e4567-e89b-42d3-a456-426614174002",
          startEditing: true,
        }),
      ),
    );

    expect(html).toContain("Spara ändringar");
    expect(html).toContain("Avbryt");
    expect(html).toContain('aria-busy="false"');
  });

  it("marks an edited field as dirty and clears that state when it is restored", () => {
    const changedValues = {
      ...initialValues,
      responsibleSocialWorkerEmail: "ny.handlaggare@example.test",
    };

    expect(areClientEditFormValuesEqual(initialValues, changedValues)).toBe(
      false,
    );
    expect(areClientEditFormValuesEqual(initialValues, initialValues)).toBe(
      true,
    );
  });
});
