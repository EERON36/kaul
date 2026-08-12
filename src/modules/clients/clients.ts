import "server-only";

import {
  requireApplicationUser,
  type ApplicationUser,
} from "../authentication/guards";
import { requireAdministrator } from "../users/authorization";
import type {
  CreateAssignmentInput,
  CreateClientInput,
  EndAssignmentInput,
  UpdateClientInput,
} from "./client-input";
import {
  ClientManagementError,
  createAssignmentInternal,
  createClientInternal,
  endAssignmentInternal,
  listAssignableStaffInternal,
  listClientsInternal,
  updateClientInternal,
  type ClientListItem,
} from "./clients-internal";

export {
  ClientManagementError,
  type ClientListItem,
  type CreateAssignmentInput,
  type CreateClientInput,
  type EndAssignmentInput,
  type UpdateClientInput,
};

export async function listClients(): Promise<{
  user: ApplicationUser;
  clients: readonly ClientListItem[];
}> {
  const user = await requireApplicationUser();
  return { user, clients: await listClientsInternal(user) };
}

export async function listAssignableStaff() {
  const actor = await requireAdministrator();
  return listAssignableStaffInternal(actor);
}

export async function createClient(input: CreateClientInput) {
  const actor = await requireAdministrator();
  return createClientInternal(input, actor);
}

export async function updateClient(input: UpdateClientInput) {
  const actor = await requireAdministrator();
  return updateClientInternal(input, actor);
}

export async function createAssignment(input: CreateAssignmentInput) {
  const actor = await requireAdministrator();
  return createAssignmentInternal(input, actor);
}

export async function endAssignment(input: EndAssignmentInput) {
  const actor = await requireAdministrator();
  return endAssignmentInternal(input, actor);
}
