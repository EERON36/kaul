import "server-only";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import type { Prisma } from "../../generated/prisma/client";

import { prisma } from "../../lib/prisma";
import {
  createLogoutSucceededAuditIntent,
  generateAuditOperationId,
  recordAmbiguousAuditOutcome,
  recordFailedAuditOutcome,
  recordSucceededAuditOutcome,
  type AuditIntentHandle,
} from "../audit/audit";
import { auth, createAuthenticationOptions } from "./auth";
import {
  runLogoutDeletionTransaction,
  type LogoutDeletionTransactionExecutor,
} from "./logout-transaction-result";

const LOGOUT_LOCK_NAMESPACE = 1_281_046_331;
const LOGOUT_AUDIT_PERSISTENCE_FAILURE =
  "Kaul logout audit persistence failed.";
const LOGOUT_DELETION_FAILURE = "Kaul logout Session deletion failed.";
const LOGOUT_DELETION_AMBIGUOUS =
  "Kaul logout Session deletion state is ambiguous.";

export function createLogoutAuthentication(
  databaseClient: Parameters<typeof createAuthenticationOptions>[0],
) {
  return betterAuth({
    ...createAuthenticationOptions(databaseClient),
    logger: { disabled: true },
  } satisfies BetterAuthOptions);
}

const logoutAuthentication = createLogoutAuthentication(prisma);
type LogoutAuthentication = ReturnType<typeof createLogoutAuthentication>;

export type TrustedLogoutSession = Readonly<{
  sessionId: string;
  userId: string;
  organisationId: string;
}>;

export type LogoutResult = Readonly<{
  setCookieHeaders: readonly string[];
}>;

export type LogoutMarker =
  | "COOKIE_CLEAR_READY"
  | "SESSION_TRUSTED"
  | "INTENT_PERSISTED"
  | "DELETION_VERIFIED"
  | "DELETION_COMMITTED"
  | "SUCCEEDED_APPENDED";

export type LogoutTestDependencies = Readonly<{
  operationId?: string;
  createCookieClearingHeaders?: () => Promise<readonly string[]>;
  loadTrustedSession?: (
    headers: Headers,
  ) => Promise<TrustedLogoutSession | null>;
  trustedSessionAuthentication?: LogoutAuthentication;
  createIntent?: typeof createLogoutSucceededAuditIntent;
  performBetterAuthSignOut?: (
    transaction: Prisma.TransactionClient,
    headers: Headers,
  ) => Promise<Response>;
  recordSucceededOutcome?: typeof recordSucceededAuditOutcome;
  recordFailedOutcome?: typeof recordFailedAuditOutcome;
  recordAmbiguousOutcome?: typeof recordAmbiguousAuditOutcome;
  transactionExecutor?: LogoutDeletionTransactionExecutor<Prisma.TransactionClient>;
  afterDeletionVerified?: () => void | Promise<void>;
  onMarker?: (marker: LogoutMarker) => void;
}>;

function mark(dependencies: LogoutTestDependencies, marker: LogoutMarker) {
  dependencies.onMarker?.(marker);
}

function logAuditPersistenceFailure(): void {
  console.error(LOGOUT_AUDIT_PERSISTENCE_FAILURE);
}

function logDeletionFailure(): void {
  console.error(LOGOUT_DELETION_FAILURE);
}

function logDeletionAmbiguous(): void {
  console.error(LOGOUT_DELETION_AMBIGUOUS);
}

async function createCookieClearingHeaders(): Promise<readonly string[]> {
  const response = await auth.api.signOut({
    headers: new Headers(),
    asResponse: true,
  });
  const setCookieHeaders = response.headers.getSetCookie();

  if (
    !response.ok ||
    !setCookieHeaders.some(
      (header) =>
        header.includes("session_token=") && /Max-Age=0(?:;|$)/i.test(header),
    )
  ) {
    throw new Error("Logout cookie clearing is unavailable.");
  }

  return setCookieHeaders;
}

async function loadTrustedSession(
  requestHeaders: Headers,
  sessionAuthentication: LogoutAuthentication = logoutAuthentication,
): Promise<TrustedLogoutSession | null> {
  const session = await sessionAuthentication.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });

  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.session.userId },
    select: {
      id: true,
      organisationId: true,
      organisation: { select: { id: true } },
    },
  });

  if (
    !user ||
    session.user.id !== user.id ||
    user.organisationId.length === 0 ||
    user.organisation.id !== user.organisationId
  ) {
    throw new Error("Trusted logout Session is inconsistent.");
  }

  return {
    sessionId: session.session.id,
    userId: user.id,
    organisationId: user.organisationId,
  };
}

async function performBetterAuthSignOut(
  transaction: Prisma.TransactionClient,
  requestHeaders: Headers,
): Promise<Response> {
  const baseOptions = createAuthenticationOptions(transaction);
  const transactionAuthentication = betterAuth({
    ...baseOptions,
    logger: { disabled: true },
  } satisfies BetterAuthOptions);

  return transactionAuthentication.api.signOut({
    headers: requestHeaders,
    asResponse: true,
  });
}

async function deleteAndVerifySession(
  transaction: Prisma.TransactionClient,
  requestHeaders: Headers,
  trustedSession: TrustedLogoutSession,
  dependencies: LogoutTestDependencies,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(
      ${LOGOUT_LOCK_NAMESPACE},
      hashtext(${trustedSession.sessionId})
    )::text AS "lockResult"
  `;

  const sessionBefore = await transaction.session.findUnique({
    where: { id: trustedSession.sessionId },
    select: { id: true, userId: true },
  });

  if (!sessionBefore || sessionBefore.userId !== trustedSession.userId) {
    throw new Error("Logout Session is no longer available.");
  }

  const response = await (
    dependencies.performBetterAuthSignOut ?? performBetterAuthSignOut
  )(transaction, requestHeaders);

  if (!response.ok) {
    throw new Error("Better Auth sign-out did not complete.");
  }

  const sessionAfter = await transaction.session.findUnique({
    where: { id: trustedSession.sessionId },
    select: { id: true },
  });

  if (sessionAfter) {
    throw new Error("Logout Session deletion was not verified.");
  }

  mark(dependencies, "DELETION_VERIFIED");
  await dependencies.afterDeletionVerified?.();
}

function defaultTransactionExecutor(
  callback: (transaction: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  return prisma.$transaction(callback, { timeout: 30_000 });
}

async function persistFailure(
  intent: AuditIntentHandle,
  dependencies: LogoutTestDependencies,
): Promise<void> {
  try {
    await (dependencies.recordFailedOutcome ?? recordFailedAuditOutcome)(
      intent,
    );
  } catch {
    logAuditPersistenceFailure();
  }
}

async function persistAmbiguous(
  intent: AuditIntentHandle,
  dependencies: LogoutTestDependencies,
): Promise<void> {
  try {
    await (dependencies.recordAmbiguousOutcome ?? recordAmbiguousAuditOutcome)(
      intent,
    );
  } catch {
    logAuditPersistenceFailure();
  }
}

export async function logoutCurrentSessionInternal(
  requestHeaders: Headers,
  testDependencies?: LogoutTestDependencies,
): Promise<LogoutResult> {
  if (testDependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error("Logout test support requires NODE_ENV=test.");
  }

  const dependencies = testDependencies ?? {};
  const setCookieHeaders = await (
    dependencies.createCookieClearingHeaders ?? createCookieClearingHeaders
  )();
  mark(dependencies, "COOKIE_CLEAR_READY");

  let trustedSession: TrustedLogoutSession | null;
  try {
    trustedSession = dependencies.loadTrustedSession
      ? await dependencies.loadTrustedSession(requestHeaders)
      : await loadTrustedSession(
          requestHeaders,
          dependencies.trustedSessionAuthentication ?? logoutAuthentication,
        );
  } catch {
    logDeletionFailure();
    return { setCookieHeaders };
  }

  if (!trustedSession) return { setCookieHeaders };
  mark(dependencies, "SESSION_TRUSTED");

  let intent: AuditIntentHandle;
  try {
    intent = await (
      dependencies.createIntent ?? createLogoutSucceededAuditIntent
    )({
      operationId: dependencies.operationId ?? generateAuditOperationId(),
      actor: {
        userId: trustedSession.userId,
        organisationId: trustedSession.organisationId,
      },
    });
  } catch {
    logAuditPersistenceFailure();
    return { setCookieHeaders };
  }
  mark(dependencies, "INTENT_PERSISTED");

  const result = await runLogoutDeletionTransaction(
    dependencies.transactionExecutor ?? defaultTransactionExecutor,
    (transaction) =>
      deleteAndVerifySession(
        transaction,
        requestHeaders,
        trustedSession,
        dependencies,
      ),
  );

  if (result.state === "CALLBACK_FAILED") {
    await persistFailure(intent, dependencies);
    logDeletionFailure();
    return { setCookieHeaders };
  }

  if (result.state === "UNKNOWN") {
    await persistAmbiguous(intent, dependencies);
    logDeletionAmbiguous();
    return { setCookieHeaders };
  }

  mark(dependencies, "DELETION_COMMITTED");
  try {
    await (dependencies.recordSucceededOutcome ?? recordSucceededAuditOutcome)(
      intent,
    );
    mark(dependencies, "SUCCEEDED_APPENDED");
  } catch {
    logAuditPersistenceFailure();
  }

  return { setCookieHeaders };
}
