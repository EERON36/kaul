import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins";

import { getEnvironment } from "../../lib/environment";
import { prisma } from "../../lib/prisma";

import { adminAccessControl, adminRoles } from "./permissions";

const environment = getEnvironment();

export const authenticationOptions = {
  appName: "Kaul",
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.BETTER_AUTH_SECRET,
  trustedOrigins: [new URL(environment.BETTER_AUTH_URL).origin],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    minPasswordLength: 15,
    maxPasswordLength: 128,
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
    expiresIn: 43_200,
    disableSessionRefresh: true,
    cookieCache: {
      enabled: false,
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

export const auth = betterAuth(authenticationOptions);
