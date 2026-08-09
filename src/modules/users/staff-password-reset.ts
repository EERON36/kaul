import "server-only";

import { headers } from "next/headers";

import { requireAdministrator } from "./authorization";
import {
  resetStaffPasswordInternal,
  type StaffPasswordResetResult,
} from "./staff-password-reset-internal";
import type { StaffPasswordResetInput } from "./staff-management-input";

export type { StaffPasswordResetInput, StaffPasswordResetResult };

export async function resetStaffPassword(
  input: StaffPasswordResetInput,
): Promise<StaffPasswordResetResult> {
  const actor = await requireAdministrator();
  return resetStaffPasswordInternal(input, actor, await headers());
}
