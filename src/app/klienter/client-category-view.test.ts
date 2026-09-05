import { describe, expect, it } from "vitest";

import type { ClientListItem } from "@/modules/clients/clients";

import {
  filterClientsForCategoryView,
  parseClientCategoryView,
} from "./client-category-view";

const client = (id: string, category: string): ClientListItem => ({
  id,
  firstName: "Fiktiv",
  lastName: "Klient",
  personIdentifier: `REF-${id}`,
  category,
  status: "ACTIVE",
});

describe("Client category view", () => {
  it("uses Vuxna by default and accepts only the supported Swedish query values", () => {
    expect(parseClientCategoryView(undefined)).toBe("ADULT");
    expect(parseClientCategoryView("ungdomar")).toBe("YOUTH");
    expect(parseClientCategoryView("alla")).toBe("ALL");
    expect(parseClientCategoryView("okand")).toBe("ADULT");
    expect(parseClientCategoryView(["ungdomar", "alla"])).toBe("ADULT");
  });

  it("filters the visible list without removing historical categories from Alla klienter", () => {
    const clients = [
      client("adult", "ADULT"),
      client("youth", "YOUTH"),
      client("historical", "Fiktiv kategori"),
    ];

    expect(filterClientsForCategoryView(clients, "ADULT")).toEqual([
      clients[0],
    ]);
    expect(filterClientsForCategoryView(clients, "YOUTH")).toEqual([
      clients[1],
    ]);
    expect(filterClientsForCategoryView(clients, "ALL")).toEqual(clients);
  });
});
