import type { ClientCategory } from "@/modules/clients/client-category";
import type { ClientListItem } from "@/modules/clients/clients";

export type ClientCategoryView = ClientCategory | "ALL";

export function parseClientCategoryView(
  value: string | string[] | undefined,
): ClientCategoryView {
  if (value === "ungdomar") return "YOUTH";
  if (value === "alla") return "ALL";
  return "ADULT";
}

export function filterClientsForCategoryView(
  clients: readonly ClientListItem[],
  view: ClientCategoryView,
): readonly ClientListItem[] {
  if (view === "ALL") return clients;
  return clients.filter((client) => client.category === view);
}
