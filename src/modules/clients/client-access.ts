import "server-only";

import type { Prisma } from "../../generated/prisma/client";
import { ClientStatus } from "../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import {
  requireApplicationUser,
  type ApplicationUser,
} from "../authentication/guards";

const CLIENT_ACCESS_ERROR_MESSAGE = "Client access requirement not satisfied.";

export class ClientAccessError extends Error {
  constructor() {
    super(CLIENT_ACCESS_ERROR_MESSAGE);
    Object.defineProperty(this, "name", {
      value: "ClientAccessError",
      configurable: true,
    });
  }
}

const clientDetailSelection = {
  id: true,
  firstName: true,
  lastName: true,
  personIdentifier: true,
  placingUnit: true,
  legalBasis: true,
  responsibleSocialWorkerName: true,
  responsibleSocialWorkerPhone: true,
  responsibleSocialWorkerEmail: true,
  category: true,
  status: true,
  archivedAt: true,
  assignments: {
    orderBy: [{ endedAt: "asc" }, { startedAt: "desc" }],
    select: {
      id: true,
      responsibility: true,
      startedAt: true,
      endedAt: true,
      staffUser: {
        select: {
          id: true,
          name: true,
          professionalTitle: true,
        },
      },
    },
  },
} satisfies Prisma.ClientSelect;

function getStaffClientAccessWhere(
  user: ApplicationUser,
): Prisma.ClientWhereInput {
  return {
    organisationId: user.organisationId,
    status: ClientStatus.ACTIVE,
    assignments: {
      some: {
        organisationId: user.organisationId,
        staffUserId: user.userId,
        endedAt: null,
      },
    },
  };
}

export function getOrdinaryClientAccessWhere(
  user: ApplicationUser,
): Prisma.ClientWhereInput {
  if (user.role === "STAFF_MEMBER") {
    return getStaffClientAccessWhere(user);
  }

  return {
    organisationId: user.organisationId,
    status: { in: [ClientStatus.ACTIVE, ClientStatus.INACTIVE] },
  };
}

export function getClientDetailAccessWhere(
  user: ApplicationUser,
): Prisma.ClientWhereInput {
  return user.role === "STAFF_MEMBER"
    ? getStaffClientAccessWhere(user)
    : { organisationId: user.organisationId };
}

export async function findAccessibleClientForUser(
  clientId: string,
  user: ApplicationUser,
) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      ...getClientDetailAccessWhere(user),
    },
    select: clientDetailSelection,
  });
}

export async function requireClientAccess(clientId: string) {
  const user = await requireApplicationUser();
  const client = await findAccessibleClientForUser(clientId, user);

  if (!client) {
    throw new ClientAccessError();
  }

  return { user, client } as const;
}
