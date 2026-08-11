import "server-only";

import {
  betterAuth,
  type BetterAuthOptions,
  type BetterAuthPlugin,
} from "better-auth";

import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  appendAuditOutcomeInTransaction,
  createLoginSucceededAuditIntent,
  generateAuditOperationId,
  recordAmbiguousAuditOutcome,
  recordFailedAuditOutcome,
  type AuditIntentHandle,
} from "../audit/audit";
import { createAuthenticationOptions } from "./auth";
import {
  bufferAuthenticationResponse,
  releaseAuthenticationResponse,
} from "./login-audit-response";
import {
  classifyLoginAuditTransactionResult,
  runLoginAuditTransaction,
  type LoginAuditTransactionExecutor,
} from "./login-audit-transaction-result";
import { createAuthenticationUnavailableResponse } from "./route-policy";

const LOGIN_AUDIT_OPERATIONAL_FAILURE =
  "Kaul authentication audit operation failed.";

export type LoginAuditMarker =
  | "TRUSTED_IDENTITY"
  | "INTENT_PERSISTED"
  | "SESSION_VERIFIED"
  | "SUCCEEDED_APPENDED"
  | "HANDLER_COMPLETED"
  | "BACKGROUND_TASKS_DRAINED"
  | "RESPONSE_BUFFERED";

type LoginAuditState = {
  trustedIdentity?: Readonly<{ userId: string; organisationId: string }>;
  intent?: AuditIntentHandle;
  session?: Readonly<{ id: string; userId: string }>;
  succeededOutcomeAppended: boolean;
  failedOutcomeAttempted: boolean;
  failedOutcomeAppended: boolean;
  backgroundTasks: Promise<unknown>[];
};

export type LoginAuditTestDependencies = Readonly<{
  operationId?: string;
  createIntent?: typeof createLoginSucceededAuditIntent;
  appendOutcome?: typeof appendAuditOutcomeInTransaction;
  recordFailedOutcome?: typeof recordFailedAuditOutcome;
  recordAmbiguousOutcome?: typeof recordAmbiguousAuditOutcome;
  transactionExecutor?: LoginAuditTransactionExecutor<Prisma.TransactionClient>;
  afterIntentPersisted?: () => void | Promise<void>;
  afterSessionVerified?: () => void | Promise<void>;
  afterSucceededOutcome?: () => void | Promise<void>;
  transformAuthenticationResponse?: (
    response: Response,
  ) => Response | Promise<Response>;
  onMarker?: (marker: LoginAuditMarker) => void;
}>;

function createState(): LoginAuditState {
  return {
    succeededOutcomeAppended: false,
    failedOutcomeAttempted: false,
    failedOutcomeAppended: false,
    backgroundTasks: [],
  };
}

function mark(
  dependencies: LoginAuditTestDependencies,
  marker: LoginAuditMarker,
): void {
  dependencies.onMarker?.(marker);
}

function logOperationalFailure(): void {
  console.error(LOGIN_AUDIT_OPERATIONAL_FAILURE);
}

async function drainBackgroundTasks(state: LoginAuditState): Promise<void> {
  while (state.backgroundTasks.length > 0) {
    const batch = state.backgroundTasks.splice(0);
    await Promise.all(batch);
  }
}

function createLoginAuditPlugin(options: {
  operationId: string;
  transaction: Prisma.TransactionClient;
  state: LoginAuditState;
  dependencies: LoginAuditTestDependencies;
}): BetterAuthPlugin {
  const createIntent =
    options.dependencies.createIntent ?? createLoginSucceededAuditIntent;
  const appendOutcome =
    options.dependencies.appendOutcome ?? appendAuditOutcomeInTransaction;

  return {
    id: "kaul-login-succeeded-audit",
    init() {
      return {
        options: {
          databaseHooks: {
            session: {
              create: {
                before: async (session) => {
                  if (options.state.trustedIdentity) {
                    throw new Error("Login audit state is inconsistent.");
                  }

                  const user = await options.transaction.user.findUnique({
                    where: { id: session.userId },
                    select: {
                      id: true,
                      organisationId: true,
                      organisation: { select: { id: true } },
                    },
                  });

                  if (
                    !user ||
                    user.organisationId.length === 0 ||
                    user.organisation.id !== user.organisationId
                  ) {
                    throw new Error("Login audit identity is inconsistent.");
                  }

                  options.state.trustedIdentity = {
                    userId: user.id,
                    organisationId: user.organisationId,
                  };
                  mark(options.dependencies, "TRUSTED_IDENTITY");
                  options.state.intent = await createIntent({
                    operationId: options.operationId,
                    actor: {
                      userId: user.id,
                      organisationId: user.organisationId,
                    },
                  });
                  mark(options.dependencies, "INTENT_PERSISTED");
                  await options.dependencies.afterIntentPersisted?.();
                },
                after: async (session) => {
                  const trustedIdentity = options.state.trustedIdentity;
                  const intent = options.state.intent;
                  if (
                    !trustedIdentity ||
                    !intent ||
                    session.userId !== trustedIdentity.userId
                  ) {
                    throw new Error("Login audit Session is inconsistent.");
                  }

                  const storedSession =
                    await options.transaction.session.findUnique({
                      where: { id: session.id },
                      select: { id: true, userId: true },
                    });
                  if (
                    !storedSession ||
                    storedSession.userId !== trustedIdentity.userId
                  ) {
                    throw new Error("Login audit Session is inconsistent.");
                  }

                  options.state.session = storedSession;
                  mark(options.dependencies, "SESSION_VERIFIED");
                  await options.dependencies.afterSessionVerified?.();
                  await appendOutcome(options.transaction, intent, "SUCCEEDED");
                  options.state.succeededOutcomeAppended = true;
                  mark(options.dependencies, "SUCCEEDED_APPENDED");
                  await options.dependencies.afterSucceededOutcome?.();
                },
              },
            },
          },
        },
      };
    },
  };
}

function createTransactionAuthentication(options: {
  transaction: Prisma.TransactionClient;
  operationId: string;
  state: LoginAuditState;
  dependencies: LoginAuditTestDependencies;
}) {
  const baseOptions = createAuthenticationOptions(options.transaction);
  const auditPlugin = createLoginAuditPlugin(options);
  const authenticationOptions = {
    ...baseOptions,
    logger: { disabled: true },
    advanced: {
      ...baseOptions.advanced,
      backgroundTasks: {
        handler(task: Promise<unknown>) {
          options.state.backgroundTasks.push(task);
        },
      },
    },
    plugins: [auditPlugin, ...baseOptions.plugins],
  } satisfies BetterAuthOptions;

  return betterAuth(authenticationOptions);
}

function defaultTransactionExecutor<TResult>(
  callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
): Promise<TResult> {
  return prisma.$transaction(callback, { timeout: 30_000 });
}

async function appendDefinitiveFailure(
  state: LoginAuditState,
  dependencies: LoginAuditTestDependencies,
): Promise<boolean> {
  if (!state.intent || state.failedOutcomeAttempted) return false;

  try {
    await (dependencies.recordFailedOutcome ?? recordFailedAuditOutcome)(
      state.intent,
    );
    return true;
  } catch {
    return false;
  }
}

async function appendAmbiguousOutcome(
  state: LoginAuditState,
  dependencies: LoginAuditTestDependencies,
): Promise<void> {
  if (!state.intent) return;

  try {
    await (dependencies.recordAmbiguousOutcome ?? recordAmbiguousAuditOutcome)(
      state.intent,
    );
  } catch {
    // The immutable winner, or an unresolved operation, requires review.
  }
}

export async function handleAuditedEmailSignInInternal(
  request: Request,
  testDependencies?: LoginAuditTestDependencies,
): Promise<Response> {
  if (testDependencies !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error("Login-audit test support requires NODE_ENV=test.");
  }

  const dependencies = testDependencies ?? {};
  const operationId = dependencies.operationId ?? generateAuditOperationId();
  const state = createState();
  const executeTransaction =
    dependencies.transactionExecutor ?? defaultTransactionExecutor;
  const transactionResult = await runLoginAuditTransaction(
    executeTransaction,
    async (transaction) => {
      const transactionAuthentication = createTransactionAuthentication({
        transaction,
        operationId,
        state,
        dependencies,
      });
      const originalAuthenticationResponse =
        await transactionAuthentication.handler(request);
      const authenticationResponse =
        dependencies.transformAuthenticationResponse
          ? await dependencies.transformAuthenticationResponse(
              originalAuthenticationResponse,
            )
          : originalAuthenticationResponse;
      mark(dependencies, "HANDLER_COMPLETED");
      await drainBackgroundTasks(state);
      mark(dependencies, "BACKGROUND_TASKS_DRAINED");
      const bufferedResponse = await bufferAuthenticationResponse(
        authenticationResponse,
      );
      mark(dependencies, "RESPONSE_BUFFERED");

      if (state.trustedIdentity && !state.intent) {
        throw new Error("Login audit intent is unavailable.");
      }

      if (!state.intent) return bufferedResponse;

      if (state.succeededOutcomeAppended) {
        if (
          !authenticationResponse.ok ||
          !state.session ||
          state.session.userId !== state.trustedIdentity?.userId ||
          bufferedResponse.setCookieHeaders.length === 0
        ) {
          throw new Error("Login audit success is inconsistent.");
        }

        return bufferedResponse;
      }

      if (
        state.session ||
        authenticationResponse.ok ||
        bufferedResponse.setCookieHeaders.length > 0
      ) {
        throw new Error("Login audit Session establishment failed.");
      }

      state.failedOutcomeAttempted = true;
      await (dependencies.appendOutcome ?? appendAuditOutcomeInTransaction)(
        transaction,
        state.intent,
        "FAILED",
      );
      state.failedOutcomeAppended = true;
      return bufferedResponse;
    },
  );

  if (transactionResult.state === "COMPLETED") {
    return releaseAuthenticationResponse(transactionResult.value);
  }

  const classification = classifyLoginAuditTransactionResult(
    transactionResult.state,
  );

  if (classification === "FAILED") {
    if (state.intent && !state.failedOutcomeAppended) {
      await appendDefinitiveFailure(state, dependencies);
    }
  } else {
    await appendAmbiguousOutcome(state, dependencies);
  }

  logOperationalFailure();
  return createAuthenticationUnavailableResponse();
}
