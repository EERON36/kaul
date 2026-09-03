import { readFileSync } from "node:fs";
import { createSecretKey, type KeyObject } from "node:crypto";

import { z } from "zod";

const keyIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u);

const encodedKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/u)
  .transform((value, context) => {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
      context.addIssue({ code: "custom", message: "Invalid key material." });
      return z.NEVER;
    }
    return decoded;
  });

const keyringSchema = z
  .object({
    formatVersion: z.literal(1),
    activeKeyId: keyIdSchema,
    keys: z
      .array(z.object({ id: keyIdSchema, key: encodedKeySchema }).strict())
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const identifiers = value.keys.map((entry) => entry.id);
    if (new Set(identifiers).size !== identifiers.length) {
      context.addIssue({ code: "custom", message: "Duplicate key ID." });
    }
    if (!identifiers.includes(value.activeKeyId)) {
      context.addIssue({ code: "custom", message: "Active key is missing." });
    }
  });

export type PersonalIdentityNumberKeyring = Readonly<{
  activeKeyId: string;
  keys: ReadonlyMap<string, KeyObject>;
}>;

export function parsePersonalIdentityNumberKeyring(
  serialized: string,
): PersonalIdentityNumberKeyring {
  let json: unknown;
  try {
    json = JSON.parse(serialized);
  } catch {
    throw new Error("Invalid Personnummer keyring.");
  }

  const result = keyringSchema.safeParse(json);
  if (!result.success) {
    throw new Error("Invalid Personnummer keyring.");
  }

  const keys = new Map<string, KeyObject>();
  for (const entry of result.data.keys) {
    keys.set(entry.id, createSecretKey(entry.key));
    entry.key.fill(0);
  }
  return { activeKeyId: result.data.activeKeyId, keys };
}

let cachedPath: string | undefined;
let cachedKeyring: PersonalIdentityNumberKeyring | undefined;

export function loadPersonalIdentityNumberKeyring(
  path: string,
): PersonalIdentityNumberKeyring {
  if (cachedKeyring && cachedPath === path) return cachedKeyring;

  let serialized: string;
  try {
    serialized = readFileSync(path, "utf8");
  } catch {
    throw new Error("Personnummer keyring is unavailable.");
  }

  cachedKeyring = parsePersonalIdentityNumberKeyring(serialized);
  cachedPath = path;
  return cachedKeyring;
}

export function resetPersonalIdentityNumberKeyringCacheForTest(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Keyring cache reset is available only in tests.");
  }
  cachedPath = undefined;
  cachedKeyring = undefined;
}
