import { describe, expect, it } from "vitest";

import {
  getClientCategoryLabel,
  groupClientsByCategory,
} from "./client-category";

const client = (id: string, category: string) => ({
  id,
  firstName: "Fiktiv",
  lastName: id,
  personIdentifier: id,
  category,
  status: "ACTIVE" as const,
});

describe("Client category presentation", () => {
  it("uses Swedish labels and preserves unknown category values", () => {
    expect(getClientCategoryLabel("ADULT")).toBe("Vuxna");
    expect(getClientCategoryLabel("YOUTH")).toBe("Ungdomar");
    expect(getClientCategoryLabel("Fiktiv kategori")).toBe(
      "Kategori: Fiktiv kategori",
    );
  });

  it("groups approved categories and keeps unknown data visible separately", () => {
    expect(
      groupClientsByCategory([
        client("adult", "ADULT"),
        client("other", "Fiktiv kategori"),
        client("youth", "YOUTH"),
      ]),
    ).toEqual([
      { key: "ADULT", label: "Vuxna", clients: [client("adult", "ADULT")] },
      { key: "YOUTH", label: "Ungdomar", clients: [client("youth", "YOUTH")] },
      {
        key: "OTHER",
        label: "Övriga kategorier",
        clients: [client("other", "Fiktiv kategori")],
      },
    ]);
  });
});
