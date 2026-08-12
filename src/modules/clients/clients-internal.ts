import "server-only";

import { randomUUID } from "node:crypto";

import {
  AssignmentResponsibility,
  ClientStatus,
  UserRole,
  type Prisma,
} from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  appendAuditOutcomeInTransaction,
  AuditError,
  createUserAuditIntent,
  recordAmbiguousAuditOutcome,
  recordFailedAuditOutcome,
  type AuditIntentHandle,
} from "../audit/audit";
import type { ApplicationUser } from "../authentication/guards";
import type { AdministratorUser } from "../users/authorization";
import {
  archiveClientInputSchema,
  canonicalizePersonIdentifier,
  createAssignmentInputSchema,
  createClientInputSchema,
  endAssignmentInputSchema,
  updateClientInputSchema,
  type ArchiveClientInput,
  type CreateAssignmentInput,
  type CreateClientInput,
  type EndAssignmentInput,
  type NormalizedClientSearchQuery,
  type UpdateClientInput,
} from "./client-input";

const CLIENT_MUTATION_LOCK_NAMESPACE = 1_129_607_912;

function escapePrismaContainsPattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export type ClientListItem = Readonly<{
  id: string;
  firstName: string;
  lastName: string;
  personIdentifier: string;
  category: string;
  status: ClientStatus;
}>;

export type ClientManagementErrorCode =
  | "DUPLICATE_IDENTIFIER"
  | "TARGET_UNAVAILABLE"
  | "ASSIGNMENT_CONFLICT"
  | "ARCHIVE_STATE_CONFLICT"
  | "ACTIVE_ASSIGNMENTS"
  | "NO_CHANGES"
  | "INCONSISTENT_RESULT"
  | "OPERATION_AMBIGUOUS";

export class ClientManagementError extends Error {
  readonly code: ClientManagementErrorCode;

  constructor(code: ClientManagementErrorCode) {
    super("Client management requirement not satisfied.");
    Object.defineProperty(this, "name", {
      value: "ClientManagementError",
      configurable: true,
    });
    this.code = code;
  }
}

type DefinitiveCode = Exclude<
  ClientManagementErrorCode,
  "INCONSISTENT_RESULT" | "OPERATION_AMBIGUOUS"
>;

class DefinitiveMutationError extends Error {
  readonly code?: DefinitiveCode;

  constructor(code?: DefinitiveCode) {
    super("Client mutation failed.");
    this.code = code;
  }
}

export type ClientManagementTestDependencies = Readonly<{
  beforeBusinessTransaction?: () => void | Promise<void>;
  afterBusinessMutation?: () => void | Promise<void>;
}>;

const clientListSelection = {
  id: true,
  firstName: true,
  lastName: true,
  personIdentifier: true,
  category: true,
  status: true,
} satisfies Prisma.ClientSelect;

const clientListOrder = [
  { lastName: "asc" },
  { firstName: "asc" },
  { personIdentifier: "asc" },
] satisfies Prisma.ClientOrderByWithRelationInput[];

function getOrdinaryClientAccessWhere(
  user: ApplicationUser,
): Prisma.ClientWhereInput {
  return {
    organisationId: user.organisationId,
    ...(user.role === UserRole.STAFF_MEMBER
      ? {
          status: ClientStatus.ACTIVE,
          assignments: {
            some: { staffUserId: user.userId, endedAt: null },
          },
        }
      : {
          status: {
            in: [ClientStatus.ACTIVE, ClientStatus.INACTIVE],
          },
        }),
  };
}

function getTestDependencies(
  dependencies?: ClientManagementTestDependencies,
): ClientManagementTestDependencies {
  if (dependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error(
      "Client management dependencies are available only in tests.",
    );
  }
  return dependencies ?? {};
}

function isUniqueConstraintError(
  error: unknown,
): error is Record<string, unknown> & { code: "P2002" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isDuplicateClientIdentifierError(error: unknown): boolean {
  if (!isUniqueConstraintError(error) || !("meta" in error)) return false;
  const meta = error.meta;
  if (typeof meta !== "object" || meta === null) return false;

  const expectedIndex = "client_organisationId_personIdentifier_key";
  const target = "target" in meta ? meta.target : undefined;
  const constraint = "constraint" in meta ? meta.constraint : undefined;
  return (
    (Array.isArray(target) &&
      target.length === 2 &&
      target[0] === "organisationId" &&
      target[1] === "personIdentifier") ||
    target === expectedIndex ||
    constraint === expectedIndex
  );
}

function isUpdateDuplicateClientIdentifierError(error: unknown): boolean {
  // This update does not alter either Client identifier. The organisation-local
  // person-reference constraint is the only Client unique constraint reachable
  // from its editable fields. Prisma's reported constraint name varies by
  // adapter and PostgreSQL version, so it is not safe to depend on here.
  return isUniqueConstraintError(error);
}

async function assertCurrentAdministrator(
  transaction: Pick<Prisma.TransactionClient, "user">,
  actor: AdministratorUser,
): Promise<void> {
  const current = await transaction.user.findFirst({
    where: {
      id: actor.userId,
      organisationId: actor.organisationId,
      role: UserRole.ADMINISTRATOR,
      banned: { not: true },
    },
    select: { id: true },
  });

  if (!current) {
    throw new DefinitiveMutationError("TARGET_UNAVAILABLE");
  }
}

async function lockClient(
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

type EditableClientFields = Readonly<{
  firstName: string;
  lastName: string;
  personIdentifier: string;
  category: string;
}>;

function clientEditableFieldsEqual(
  current: EditableClientFields,
  next: EditableClientFields,
): boolean {
  return (
    current.firstName === next.firstName &&
    current.lastName === next.lastName &&
    current.personIdentifier === next.personIdentifier &&
    current.category === next.category
  );
}

async function finishFailed(
  intent: AuditIntentHandle,
  error: unknown,
): Promise<never> {
  await recordFailedAuditOutcome(intent);

  if (error instanceof AuditError) {
    throw error;
  }

  if (error instanceof DefinitiveMutationError && error.code) {
    throw new ClientManagementError(error.code);
  }

  throw new ClientManagementError("INCONSISTENT_RESULT");
}

async function finishAmbiguous(intent: AuditIntentHandle): Promise<never> {
  await recordAmbiguousAuditOutcome(intent);
  throw new ClientManagementError("OPERATION_AMBIGUOUS");
}

export async function listClientsInternal(
  user: ApplicationUser,
): Promise<readonly ClientListItem[]> {
  return prisma.client.findMany({
    where: getOrdinaryClientAccessWhere(user),
    orderBy: clientListOrder,
    select: clientListSelection,
  });
}

export async function searchClientsInternal(
  user: ApplicationUser,
  query: NormalizedClientSearchQuery,
): Promise<readonly ClientListItem[]> {
  if (!query) return listClientsInternal(user);

  const nameTokens = query.split(/\s+/u);

  return prisma.client.findMany({
    where: {
      ...getOrdinaryClientAccessWhere(user),
      OR: [
        { personIdentifier: canonicalizePersonIdentifier(query) },
        {
          AND: nameTokens.map((token) => {
            // Client name writes currently trim but do not normalise Unicode.
            // Match both canonical forms without removing Swedish diacritics.
            const decomposedToken = token.normalize("NFD");
            const canonicalVariants =
              decomposedToken === token ? [token] : [token, decomposedToken];
            const escapedVariants = canonicalVariants.map(
              escapePrismaContainsPattern,
            );

            return {
              OR: escapedVariants.flatMap((variant) => [
                {
                  firstName: { contains: variant, mode: "insensitive" },
                },
                { lastName: { contains: variant, mode: "insensitive" } },
              ]),
            };
          }),
        },
      ],
    },
    orderBy: clientListOrder,
    select: clientListSelection,
    take: 50,
  });
}

export async function listArchivedClientsInternal(
  actor: AdministratorUser,
): Promise<readonly ClientListItem[]> {
  return prisma.client.findMany({
    where: {
      organisationId: actor.organisationId,
      status: ClientStatus.ARCHIVED,
      archivedAt: { not: null },
    },
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
      { personIdentifier: "asc" },
    ],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personIdentifier: true,
      category: true,
      status: true,
    },
  });
}

export async function listAssignableStaffInternal(actor: AdministratorUser) {
  return prisma.user.findMany({
    where: {
      organisationId: actor.organisationId,
      role: UserRole.STAFF_MEMBER,
      banned: { not: true },
    },
    orderBy: [{ name: "asc" }, { professionalTitle: "asc" }],
    select: { id: true, name: true, professionalTitle: true },
  });
}

export async function createClientInternal(
  input: CreateClientInput,
  actor: AdministratorUser,
  testDependencies?: ClientManagementTestDependencies,
): Promise<ClientListItem> {
  const parsed = createClientInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  const clientId = randomUUID();
  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor,
    action: "CLIENT_CREATED",
    target: { targetId: clientId },
  });
  let transactionCompleted = false;

  try {
    const created = await prisma.$transaction(async (transaction) => {
      await assertCurrentAdministrator(transaction, actor);
      const existingIdentifier = await transaction.client.findUnique({
        where: {
          organisationId_personIdentifier: {
            organisationId: actor.organisationId,
            personIdentifier: parsed.personIdentifier,
          },
        },
        select: { id: true },
      });
      if (existingIdentifier) {
        throw new DefinitiveMutationError("DUPLICATE_IDENTIFIER");
      }
      let client;

      try {
        client = await transaction.client.create({
          data: {
            id: clientId,
            organisationId: actor.organisationId,
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            personIdentifier: parsed.personIdentifier,
            category: parsed.category,
            status: ClientStatus.INACTIVE,
            archivedAt: null,
          },
          select: {
            id: true,
            organisationId: true,
            firstName: true,
            lastName: true,
            personIdentifier: true,
            category: true,
            status: true,
            archivedAt: true,
          },
        });
      } catch (error) {
        throw new DefinitiveMutationError(
          isDuplicateClientIdentifierError(error)
            ? "DUPLICATE_IDENTIFIER"
            : undefined,
        );
      }

      if (
        client.id !== clientId ||
        client.organisationId !== actor.organisationId ||
        client.status !== ClientStatus.INACTIVE ||
        client.archivedAt !== null
      ) {
        throw new DefinitiveMutationError();
      }

      await dependencies.afterBusinessMutation?.();

      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        clientId,
      );
      transactionCompleted = true;
      return client;
    });

    return created;
  } catch (error) {
    return transactionCompleted
      ? finishAmbiguous(intent)
      : finishFailed(intent, error);
  }
}

export async function updateClientInternal(
  input: UpdateClientInput,
  actor: AdministratorUser,
  testDependencies?: ClientManagementTestDependencies,
): Promise<Readonly<{ changed: boolean; client: ClientListItem }>> {
  const parsed = updateClientInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  const nextFields: EditableClientFields = {
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    personIdentifier: parsed.personIdentifier,
    category: parsed.category,
  };
  const preflightClient = await prisma.client.findFirst({
    where: {
      id: parsed.clientId,
      organisationId: actor.organisationId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personIdentifier: true,
      category: true,
      status: true,
    },
  });

  if (!preflightClient) {
    throw new ClientManagementError("TARGET_UNAVAILABLE");
  }
  if (preflightClient.status === ClientStatus.ARCHIVED) {
    throw new ClientManagementError("TARGET_UNAVAILABLE");
  }
  if (clientEditableFieldsEqual(preflightClient, nextFields)) {
    return { changed: false, client: preflightClient };
  }

  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor,
    action: "CLIENT_UPDATED",
    target: { targetId: parsed.clientId },
  });
  let transactionCompleted = false;

  try {
    const updated = await prisma.$transaction(async (transaction) => {
      await lockClient(transaction, parsed.clientId);
      await assertCurrentAdministrator(transaction, actor);
      const current = await transaction.client.findFirst({
        where: {
          id: parsed.clientId,
          organisationId: actor.organisationId,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          personIdentifier: true,
          category: true,
          status: true,
        },
      });

      if (!current) {
        throw new DefinitiveMutationError("TARGET_UNAVAILABLE");
      }
      if (current.status === ClientStatus.ARCHIVED) {
        throw new DefinitiveMutationError("TARGET_UNAVAILABLE");
      }
      if (clientEditableFieldsEqual(current, nextFields)) {
        throw new DefinitiveMutationError("NO_CHANGES");
      }

      let client: ClientListItem;
      try {
        client = await transaction.client.update({
          where: {
            organisationId_id: {
              organisationId: actor.organisationId,
              id: parsed.clientId,
            },
          },
          data: nextFields,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            personIdentifier: true,
            category: true,
            status: true,
          },
        });
      } catch (error) {
        throw new DefinitiveMutationError(
          isUpdateDuplicateClientIdentifierError(error)
            ? "DUPLICATE_IDENTIFIER"
            : undefined,
        );
      }

      await dependencies.afterBusinessMutation?.();
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        client.id,
      );
      transactionCompleted = true;
      return client;
    });

    return { changed: true, client: updated };
  } catch (error) {
    return transactionCompleted
      ? finishAmbiguous(intent)
      : finishFailed(intent, error);
  }
}

export async function archiveClientInternal(
  input: ArchiveClientInput,
  actor: AdministratorUser,
  testDependencies?: ClientManagementTestDependencies,
): Promise<Readonly<{ clientId: string; archivedAt: Date }>> {
  const parsed = archiveClientInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  const [currentAdministrator, preflightClient] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: actor.userId,
        organisationId: actor.organisationId,
        role: UserRole.ADMINISTRATOR,
        banned: { not: true },
      },
      select: { id: true },
    }),
    prisma.client.findFirst({
      where: {
        id: parsed.clientId,
        organisationId: actor.organisationId,
      },
      select: {
        id: true,
        status: true,
        archivedAt: true,
        _count: { select: { assignments: { where: { endedAt: null } } } },
      },
    }),
  ]);

  if (!currentAdministrator || !preflightClient) {
    throw new ClientManagementError("TARGET_UNAVAILABLE");
  }
  if (preflightClient._count.assignments > 0) {
    throw new ClientManagementError("ACTIVE_ASSIGNMENTS");
  }
  if (
    preflightClient.status !== ClientStatus.INACTIVE ||
    preflightClient.archivedAt !== null
  ) {
    throw new ClientManagementError("ARCHIVE_STATE_CONFLICT");
  }

  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor,
    action: "CLIENT_ARCHIVED",
    target: { targetId: parsed.clientId },
  });
  let transactionCompleted = false;

  try {
    await dependencies.beforeBusinessTransaction?.();
    return await prisma.$transaction(async (transaction) => {
      await lockClient(transaction, parsed.clientId);
      await assertCurrentAdministrator(transaction, actor);
      const current = await transaction.client.findFirst({
        where: {
          id: parsed.clientId,
          organisationId: actor.organisationId,
        },
        select: {
          id: true,
          status: true,
          archivedAt: true,
          _count: { select: { assignments: { where: { endedAt: null } } } },
        },
      });

      if (!current) {
        throw new DefinitiveMutationError("TARGET_UNAVAILABLE");
      }
      if (current._count.assignments > 0) {
        throw new DefinitiveMutationError("ACTIVE_ASSIGNMENTS");
      }
      if (
        current.status !== ClientStatus.INACTIVE ||
        current.archivedAt !== null
      ) {
        throw new DefinitiveMutationError("ARCHIVE_STATE_CONFLICT");
      }

      const archivedAt = new Date();
      const archived = await transaction.client.updateMany({
        where: {
          id: current.id,
          organisationId: actor.organisationId,
          status: ClientStatus.INACTIVE,
          archivedAt: null,
        },
        data: { status: ClientStatus.ARCHIVED, archivedAt },
      });
      if (archived.count !== 1) {
        throw new DefinitiveMutationError("ARCHIVE_STATE_CONFLICT");
      }

      await dependencies.afterBusinessMutation?.();
      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        current.id,
      );
      transactionCompleted = true;
      return { clientId: current.id, archivedAt };
    });
  } catch (error) {
    return transactionCompleted
      ? finishAmbiguous(intent)
      : finishFailed(intent, error);
  }
}

export async function createAssignmentInternal(
  input: CreateAssignmentInput,
  actor: AdministratorUser,
  testDependencies?: ClientManagementTestDependencies,
): Promise<void> {
  const parsed = createAssignmentInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  const [preflightClient, preflightStaff] = await Promise.all([
    prisma.client.findFirst({
      where: {
        id: parsed.clientId,
        organisationId: actor.organisationId,
        status: { not: ClientStatus.ARCHIVED },
      },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: {
        id: parsed.staffUserId,
        organisationId: actor.organisationId,
        role: UserRole.STAFF_MEMBER,
        banned: { not: true },
      },
      select: { id: true },
    }),
  ]);
  if (!preflightClient || !preflightStaff) {
    throw new ClientManagementError("TARGET_UNAVAILABLE");
  }
  const assignmentId = randomUUID();
  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor,
    action: "ASSIGNMENT_CREATED",
    target: { targetId: assignmentId },
  });
  let transactionCompleted = false;

  try {
    await prisma.$transaction(async (transaction) => {
      await lockClient(transaction, parsed.clientId);
      await assertCurrentAdministrator(transaction, actor);
      const client = await transaction.client.findFirst({
        where: {
          id: parsed.clientId,
          organisationId: actor.organisationId,
        },
        select: { id: true, status: true },
      });
      const staff = await transaction.user.findFirst({
        where: {
          id: parsed.staffUserId,
          organisationId: actor.organisationId,
          role: UserRole.STAFF_MEMBER,
          banned: { not: true },
        },
        select: { id: true },
      });

      if (!client || client.status === ClientStatus.ARCHIVED || !staff) {
        throw new DefinitiveMutationError("TARGET_UNAVAILABLE");
      }

      const [activePrimary, activeForStaff] = await Promise.all([
        transaction.assignment.findFirst({
          where: {
            organisationId: actor.organisationId,
            clientId: client.id,
            responsibility: AssignmentResponsibility.PRIMARY,
            endedAt: null,
          },
          select: { id: true },
        }),
        transaction.assignment.findFirst({
          where: {
            organisationId: actor.organisationId,
            clientId: client.id,
            staffUserId: staff.id,
            endedAt: null,
          },
          select: { id: true },
        }),
      ]);

      const primaryAllowed =
        parsed.responsibility === AssignmentResponsibility.PRIMARY &&
        client.status === ClientStatus.INACTIVE &&
        !activePrimary;
      const secondaryAllowed =
        parsed.responsibility === AssignmentResponsibility.SECONDARY &&
        client.status === ClientStatus.ACTIVE &&
        Boolean(activePrimary);

      if (activeForStaff || (!primaryAllowed && !secondaryAllowed)) {
        throw new DefinitiveMutationError("ASSIGNMENT_CONFLICT");
      }

      try {
        await transaction.assignment.create({
          data: {
            id: assignmentId,
            organisationId: actor.organisationId,
            clientId: client.id,
            staffUserId: staff.id,
            responsibility: parsed.responsibility,
            createdByUserId: actor.userId,
          },
        });
      } catch (error) {
        throw new DefinitiveMutationError(
          isUniqueConstraintError(error) ? "ASSIGNMENT_CONFLICT" : undefined,
        );
      }

      if (primaryAllowed) {
        const updated = await transaction.client.updateMany({
          where: {
            id: client.id,
            organisationId: actor.organisationId,
            status: ClientStatus.INACTIVE,
          },
          data: { status: ClientStatus.ACTIVE },
        });
        if (updated.count !== 1) {
          throw new DefinitiveMutationError();
        }
      }

      await dependencies.afterBusinessMutation?.();

      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        assignmentId,
      );
      transactionCompleted = true;
    });
  } catch (error) {
    return transactionCompleted
      ? finishAmbiguous(intent)
      : finishFailed(intent, error);
  }
}

export async function endAssignmentInternal(
  input: EndAssignmentInput,
  actor: AdministratorUser,
  testDependencies?: ClientManagementTestDependencies,
): Promise<Readonly<{ clientId: string }>> {
  const parsed = endAssignmentInputSchema.parse(input);
  const dependencies = getTestDependencies(testDependencies);
  const preflightAssignment = await prisma.assignment.findFirst({
    where: {
      id: parsed.assignmentId,
      organisationId: actor.organisationId,
      endedAt: null,
    },
    select: { id: true },
  });
  if (!preflightAssignment) {
    throw new ClientManagementError("TARGET_UNAVAILABLE");
  }
  const intent = await createUserAuditIntent({
    operationId: parsed.operationId,
    actor,
    action: "ASSIGNMENT_ENDED",
    target: { targetId: parsed.assignmentId },
  });
  let transactionCompleted = false;

  try {
    return await prisma.$transaction(async (transaction) => {
      await assertCurrentAdministrator(transaction, actor);
      const initial = await transaction.assignment.findFirst({
        where: {
          id: parsed.assignmentId,
          organisationId: actor.organisationId,
        },
        select: { clientId: true },
      });
      if (!initial) {
        throw new DefinitiveMutationError("TARGET_UNAVAILABLE");
      }

      await lockClient(transaction, initial.clientId);
      const assignment = await transaction.assignment.findFirst({
        where: {
          id: parsed.assignmentId,
          organisationId: actor.organisationId,
          endedAt: null,
        },
        select: { id: true, clientId: true, responsibility: true },
      });
      if (!assignment) {
        throw new DefinitiveMutationError("TARGET_UNAVAILABLE");
      }

      const endedAt = new Date();
      const updated = await transaction.assignment.updateMany({
        where: { id: assignment.id, endedAt: null },
        data: { endedAt },
      });
      if (updated.count !== 1) {
        throw new DefinitiveMutationError("TARGET_UNAVAILABLE");
      }

      if (assignment.responsibility === AssignmentResponsibility.PRIMARY) {
        const deactivated = await transaction.client.updateMany({
          where: {
            id: assignment.clientId,
            organisationId: actor.organisationId,
            status: ClientStatus.ACTIVE,
          },
          data: { status: ClientStatus.INACTIVE },
        });
        if (deactivated.count !== 1) {
          throw new DefinitiveMutationError();
        }
      }

      await dependencies.afterBusinessMutation?.();

      await appendAuditOutcomeInTransaction(
        transaction,
        intent,
        "SUCCEEDED",
        assignment.id,
      );
      transactionCompleted = true;
      return { clientId: assignment.clientId };
    });
  } catch (error) {
    return transactionCompleted
      ? finishAmbiguous(intent)
      : finishFailed(intent, error);
  }
}
