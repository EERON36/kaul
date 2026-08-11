import type { ClientListItem } from "./clients";

export const CLIENT_CATEGORY_VALUES = ["ADULT", "YOUTH"] as const;

export type ClientCategory = (typeof CLIENT_CATEGORY_VALUES)[number];

export const CLIENT_CATEGORY_LABELS: Readonly<Record<ClientCategory, string>> =
  {
    ADULT: "Vuxna",
    YOUTH: "Ungdomar",
  };

export function getClientCategoryLabel(category: string): string {
  if (category === "ADULT" || category === "YOUTH") {
    return CLIENT_CATEGORY_LABELS[category];
  }

  return category.trim() ? `Kategori: ${category}` : "Okänd kategori";
}

export type ClientCategoryGroup = Readonly<{
  key: ClientCategory | "OTHER";
  label: string;
  clients: readonly ClientListItem[];
}>;

export function groupClientsByCategory(
  clients: readonly ClientListItem[],
): readonly ClientCategoryGroup[] {
  const groups: Record<"ADULT" | "YOUTH" | "OTHER", ClientListItem[]> = {
    ADULT: [],
    YOUTH: [],
    OTHER: [],
  };

  for (const client of clients) {
    if (client.category === "ADULT" || client.category === "YOUTH") {
      groups[client.category].push(client);
    } else {
      groups.OTHER.push(client);
    }
  }

  return [
    {
      key: "ADULT",
      label: CLIENT_CATEGORY_LABELS.ADULT,
      clients: groups.ADULT,
    },
    {
      key: "YOUTH",
      label: CLIENT_CATEGORY_LABELS.YOUTH,
      clients: groups.YOUTH,
    },
    { key: "OTHER", label: "Övriga kategorier", clients: groups.OTHER },
  ].filter(
    (group) => group.clients.length > 0,
  ) as readonly ClientCategoryGroup[];
}
