import { z } from "zod";

const databaseUrlSchema = z
  .string()
  .url()
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL must use the PostgreSQL protocol.",
  );

export const environmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  DEPLOYMENT_ENV: z
    .enum(["development", "test", "pilot", "production"])
    .default("development"),
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
