import "server-only";

import type { Prisma } from "../../generated/prisma/client";

const CLIENT_MUTATION_LOCK_NAMESPACE = 1_129_607_912;

/**
 * Serialises access-sensitive Client mutations with Assignment and lifecycle
 * changes so each operation can revalidate current access while holding the
 * same transaction-scoped lock.
 */
export async function lockClientForMutation(
  transaction: Prisma.TransactionClient,
  clientId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(
      ${CLIENT_MUTATION_LOCK_NAMESPACE},
      hashtext(${clientId})
    )::text AS "lockResult"
  `;
}
