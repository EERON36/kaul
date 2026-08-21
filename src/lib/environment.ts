import { z } from "zod";

const databaseUrlSchema = z
  .string()
  .url()
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL must use the PostgreSQL protocol.",
  );

const betterAuthUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "BETTER_AUTH_URL must use the HTTP or HTTPS protocol.");

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function databaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
}

export const environmentSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema,
    DEPLOYMENT_ENV: z
      .enum(["development", "test", "pilot", "production"])
      .default("development"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: betterAuthUrlSchema,
  })
  .superRefine((environment, context) => {
    if (
      environment.DEPLOYMENT_ENV !== "development" &&
      environment.DEPLOYMENT_ENV !== "test" &&
      new URL(environment.BETTER_AUTH_URL).protocol !== "https:"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "BETTER_AUTH_URL must use HTTPS outside development and tests.",
        path: ["BETTER_AUTH_URL"],
      });
    }

    if (environment.DEPLOYMENT_ENV === "pilot") {
      if (isLoopbackHostname(new URL(environment.DATABASE_URL).hostname)) {
        context.addIssue({
          code: "custom",
          message: "Pilot DATABASE_URL must not use a loopback host.",
          path: ["DATABASE_URL"],
        });
      }

      if (
        ["kaul", "postgres", "template0", "template1"].includes(
          databaseName(environment.DATABASE_URL),
        )
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Pilot DATABASE_URL must use a separate non-development database.",
          path: ["DATABASE_URL"],
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(
  values: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Environment {
  const result = environmentSchema.safeParse(values);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

let cachedEnvironment: Environment | undefined;

export function getEnvironment(): Environment {
  cachedEnvironment ??= parseEnvironment(process.env);
  return cachedEnvironment;
}
