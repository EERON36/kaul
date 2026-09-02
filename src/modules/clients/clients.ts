import "server-only";

import {
  requireApplicationUser,
  type ApplicationUser,
} from "../authentication/guards";
import { requireAdministrator } from "../users/authorization";
import type {
  ArchiveClientInput,
  ClientSearchInput,
  CreateAssignmentInput,
  CreateClientInput,
  EndAssignmentInput,
  UpdateClientInput,
} from "./client-input";
import { clientSearchInputSchema } from "./client-input";
import {
  ClientManagementError,
  archiveClientInternal,
  createAssignmentInternal,
  createClientInternal,
  endAssignmentInternal,
  getClientEditingDetailsInternal,
  getClientPersonalIdentityNumberForEditingInternal,
  getClientSensitiveSummaryInternal,
  listAssignableStaffInternal,
  listArchivedClientsInternal,
  listAssignedClientsForHomeInternal,
  listClientsInternal,
  searchClientsInternal,
  updateClientInternal,
  type AssignedClientHomeItem,
  type ClientListItem,
  type ClientEditingDetails,
  type ClientSensitiveSummary,
} from "./clients-internal";

export {
  ClientManagementError,
  type ArchiveClientInput,
  type AssignedClientHomeItem,
  type ClientSearchInput,
  type ClientListItem,
  type ClientEditingDetails,
  type ClientSensitiveSummary,
  type CreateAssignmentInput,
  type CreateClientInput,
  type EndAssignmentInput,
  type UpdateClientInput,
};

export async function getClientSensitiveSummary(clientId: string) {
  const actor = await requireApplicationUser();
  return getClientSensitiveSummaryInternal(actor, clientId);
}

export async function getClientEditingDetails(clientId: string) {
  const actor = await requireAdministrator();
  return getClientEditingDetailsInternal(actor, clientId);
}

export async function getClientPersonalIdentityNumberForEditing(
  clientId: string,
) {
  const actor = await requireAdministrator();
  return getClientPersonalIdentityNumberForEditingInternal(actor, clientId);
}

export async function listAssignedClientsForHome(): Promise<{
  user: ApplicationUser;
  clients: readonly AssignedClientHomeItem[];
}> {
  const user = await requireApplicationUser();
  return {
    user,
    clients: await listAssignedClientsForHomeInternal(user),
  };
}

export async function listClients(): Promise<{
  user: ApplicationUser;
  clients: readonly ClientListItem[];
}> {
  const user = await requireApplicationUser();
  return { user, clients: await listClientsInternal(user) };
}

export async function searchClients(input: ClientSearchInput): Promise<{
  user: ApplicationUser;
  clients: readonly ClientListItem[];
  query: string;
}> {
  const query = clientSearchInputSchema.parse(input);
  const user = await requireApplicationUser();
  return { user, clients: await searchClientsInternal(user, query), query };
}

export async function listAssignableStaff() {
  const actor = await requireAdministrator();
  return listAssignableStaffInternal(actor);
}

export async function listArchivedClients() {
  const actor = await requireAdministrator();
  return { user: actor, clients: await listArchivedClientsInternal(actor) };
}

export async function createClient(input: CreateClientInput) {
  const actor = await requireAdministrator();
  return createClientInternal(input, actor);
}

export async function updateClient(input: UpdateClientInput) {
  const actor = await requireAdministrator();
  return updateClientInternal(input, actor);
}

export async function archiveClient(input: ArchiveClientInput) {
  const actor = await requireAdministrator();
  return archiveClientInternal(input, actor);
}

export async function createAssignment(input: CreateAssignmentInput) {
  const actor = await requireAdministrator();
  return createAssignmentInternal(input, actor);
}

export async function endAssignment(input: EndAssignmentInput) {
  const actor = await requireAdministrator();
  return endAssignmentInternal(input, actor);
}
