import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  createClientAction: vi.fn(),
  searchClientsAction: vi.fn(),
}));

import { ClientList } from "./client-list-client";

const clients = [
  {
    id: "adult-client",
    firstName: "Fiktiv",
    lastName: "Vuxen",
    personIdentifier: "REF-VUXEN",
    category: "ADULT",
    status: "ACTIVE" as const,
  },
  {
    id: "youth-client",
    firstName: "Fiktiv",
    lastName: "Ungdom",
    personIdentifier: "REF-UNGDOM",
    category: "YOUTH",
    status: "ACTIVE" as const,
  },
];

function renderList(activeCategoryView: "ADULT" | "YOUTH" | "ALL"): string {
  return renderToStaticMarkup(
    createElement(ClientList, {
      activeCategoryView,
      canCreate: false,
      clients,
      operationId: "123e4567-e89b-42d3-a456-426614174001",
      showPrimaryStaff: false,
    }),
  );
}

describe("Client list category navigation", () => {
  it("marks Vuxna as the active default and shows only adult Clients", () => {
    const markup = renderList("ADULT");

    expect(markup).toMatch(/aria-current="page"[^>]*href="\/klienter"/);
    expect(markup).toContain("REF-VUXEN");
    expect(markup).not.toContain("REF-UNGDOM");
  });

  it("marks Ungdomar as active and keeps Alla klienter available", () => {
    const markup = renderList("YOUTH");

    expect(markup).toMatch(
      /aria-current="page"[^>]*href="\/klienter\?kategori=ungdomar"/,
    );
    expect(markup).toContain('href="/klienter?kategori=alla"');
    expect(markup).not.toContain("REF-VUXEN");
    expect(markup).toContain("REF-UNGDOM");
  });
});
