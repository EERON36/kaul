import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins";
import type { Prisma } from "../../generated/prisma/client";

import { getEnvironment } from "../../lib/environment";
import { prisma } from "../../lib/prisma";

import { adminAccessControl, adminRoles } from "./permissions";
import {
  canCreateSession,
  limitSessionExpiry,
  SESSION_LIFETIME_SECONDS,
} from "./session-policy";

const environment = getEnvironment();

export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 128;

type AuthenticationDatabaseClient = Parameters<typeof prismaAdapter>[0] &
  Pick<Prisma.TransactionClient, "user">;

export function createAuthenticationOptions(
  databaseClient: AuthenticationDatabaseClient,
) {
  return {
    appName: "Kaul",
    baseURL: environment.BETTER_AUTH_URL,
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(environment.BETTER_AUTH_URL).origin],
    database: prismaAdapter(databaseClient, {
      provider: "postgresql",
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },
    user: {
      additionalFields: {
        organisationId: {
          type: "string",
          required: true,
          input: false,
        },
        professionalTitle: {
          type: "string",
          required: true,
          input: false,
        },
        mustChangePassword: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
        },
        temporaryCredentialExpiresAt: {
          type: "date",
          required: false,
          input: false,
        },
      },
    },
    session: {
      expiresIn: SESSION_LIFETIME_SECONDS,
      disableSessionRefresh: true,
      cookieCache: {
        enabled: false,
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (!(await canCreateSession(databaseClient, session.userId))) {
              return false;
            }

            return {
              data: {
                expiresAt: limitSessionExpiry(session),
              },
            };
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": {
          window: 60,
          max: 5,
        },
      },
    },
    advanced: {
      // Caddy must overwrite x-real-ip, and Kaul must not be directly public.
      ipAddress: {
        ipAddressHeaders: ["x-real-ip"],
      },
      crossSubDomainCookies: {
        enabled: false,
      },
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
    plugins: [
      admin({
        ac: adminAccessControl,
        roles: adminRoles,
        defaultRole: "STAFF_MEMBER",
        adminRoles: ["ADMINISTRATOR"],
      }),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuthentication(
  databaseClient: AuthenticationDatabaseClient,
) {
  return betterAuth(createAuthenticationOptions(databaseClient));
}

export const authenticationOptions = createAuthenticationOptions(prisma);

export const auth = betterAuth(authenticationOptions);
