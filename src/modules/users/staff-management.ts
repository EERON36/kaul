import "server-only";

import { headers } from "next/headers";

import { requireAdministrator } from "./authorization";
import {
  createStaffMemberInternal,
  deactivateStaffMemberInternal,
  listOrganisationStaffInternal,
  reactivateStaffMemberInternal,
  StaffManagementError,
  type CreatedStaffMember,
  type StaffMemberListItem,
} from "./staff-management-internal";
import type {
  CreateStaffMemberInput,
  StaffMemberStatusInput,
} from "./staff-management-input";

export {
  StaffManagementError,
  type CreatedStaffMember,
  type CreateStaffMemberInput,
  type StaffMemberListItem,
  type StaffMemberStatusInput,
};

export async function listOrganisationStaff(): Promise<
  readonly StaffMemberListItem[]
> {
  const actor = await requireAdministrator();
  return listOrganisationStaffInternal(actor);
}

export async function createStaffMember(
  input: CreateStaffMemberInput,
): Promise<CreatedStaffMember> {
  const actor = await requireAdministrator();
  return createStaffMemberInternal(input, actor, await headers());
}

export async function deactivateStaffMember(
  input: StaffMemberStatusInput,
): Promise<void> {
  const actor = await requireAdministrator();
  return deactivateStaffMemberInternal(input, actor, await headers());
}

export async function reactivateStaffMember(
  input: StaffMemberStatusInput,
): Promise<void> {
  const actor = await requireAdministrator();
  return reactivateStaffMemberInternal(input, actor, await headers());
}
