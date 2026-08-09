import type { Prisma } from "../../generated/prisma/client";

import { getCredentialState } from "./credential-state";

type SessionPolicyDatabase = Pick<Prisma.TransactionClient, "user">;

export const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

export function limitSessionExpiry(
  session: Readonly<{ createdAt: Date; expiresAt: Date }>,
): Date {
  const maximumExpiry = new Date(
    session.createdAt.getTime() + SESSION_LIFETIME_SECONDS * 1_000,
  );

  return session.expiresAt <= maximumExpiry ? session.expiresAt : maximumExpiry;
}

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
