import type { Prisma } from "../../generated/prisma/client";

import { getCredentialState } from "./credential-state";

type SessionPolicyDatabase = Pick<Prisma.TransactionClient, "user">;

export async function canCreateSession(
  database: SessionPolicyDatabase,
  userId: string,
  currentTime: Date = new Date(),
): Promise<boolean> {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: {
      banned: true,
      mustChangePassword: true,
      temporaryCredentialExpiresAt: true,
    },
  });

  if (!user || user.banned === true) {
    return false;
  }

  return (
    getCredentialState(
      user.mustChangePassword,
      user.temporaryCredentialExpiresAt,
      currentTime,
    ) !== "TEMPORARY_CREDENTIAL_EXPIRED"
  );
}
