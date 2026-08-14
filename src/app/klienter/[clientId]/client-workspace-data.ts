import "server-only";

import { notFound, redirect } from "next/navigation";

import { AuthenticationGuardError } from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";
import {
  ClientAccessError,
  requireClientAccess,
} from "@/modules/clients/client-access";
import { JournalError } from "@/modules/journal/journal";
import { PlanningError } from "@/modules/planning/planning";

export async function loadClientWorkspace(clientId: string) {
  try {
    return await requireClientAccess(clientId);
  } catch (error) {
    return handleClientWorkspacePageError(error);
  }
}

export function handleClientWorkspacePageError(error: unknown): never {
  if (
    error instanceof ClientAccessError ||
    (error instanceof JournalError && error.code === "TARGET_UNAVAILABLE") ||
    (error instanceof PlanningError && error.code === "TARGET_UNAVAILABLE")
  ) {
    notFound();
  }
  if (error instanceof AuthenticationGuardError) {
    const destination = getApplicationErrorRedirect(error.code);
    if (destination) redirect(destination);
  }
  throw error;
}
