import "server-only";

import type { Prisma } from "../../generated/prisma/client";
import { getEnvironment } from "../../lib/environment";
import { loadPersonalIdentityNumberKeyring } from "../../lib/personal-identity-number-keyring";
import { prisma } from "../../lib/prisma";
import {
  decryptPersonalIdentityNumber,
  encryptPersonalIdentityNumber,
  PERSONAL_IDENTITY_NUMBER_ENCRYPTION_VERSION,
  type PersonalIdentityNumberEnvelope,
  type PersonalIdentityNumberScope,
} from "./personal-identity-number-crypto";

type PersonalIdentityNumberDatabase = Pick<
  Prisma.TransactionClient,
  "clientPersonalIdentityNumber"
>;

function keyring() {
  return loadPersonalIdentityNumberKeyring(
    getEnvironment().KAUL_PERSONNUMMER_KEYRING_FILE,
  );
}

function decryptEnvelope(
  scope: PersonalIdentityNumberScope,
  envelope: PersonalIdentityNumberEnvelope,
): string {
  const key = keyring().keys.get(envelope.keyId);
  if (!key) throw new Error("Stored Personnummer key is unavailable.");
  return decryptPersonalIdentityNumber(envelope, scope, key);
}

export async function readPersonalIdentityNumber(
  database: PersonalIdentityNumberDatabase,
  scope: PersonalIdentityNumberScope,
): Promise<string | null> {
  const envelope = await database.clientPersonalIdentityNumber.findUnique({
    where: {
      organisationId_clientId: scope,
    },
    select: {
      encryptionVersion: true,
      keyId: true,
      nonce: true,
      ciphertext: true,
      authenticationTag: true,
    },
  });
  return envelope ? decryptEnvelope(scope, envelope) : null;
}

export async function writePersonalIdentityNumber(
  database: PersonalIdentityNumberDatabase,
  scope: PersonalIdentityNumberScope,
  plaintext: string | null,
): Promise<void> {
  if (plaintext === null) {
    await database.clientPersonalIdentityNumber.deleteMany({ where: scope });
    return;
  }

  const currentKeyring = keyring();
  const key = currentKeyring.keys.get(currentKeyring.activeKeyId);
  if (!key) throw new Error("Active Personnummer key is unavailable.");
  const envelope = encryptPersonalIdentityNumber(
    plaintext,
    scope,
    currentKeyring.activeKeyId,
    key,
  );
  await database.clientPersonalIdentityNumber.upsert({
    where: { organisationId_clientId: scope },
    create: { ...scope, ...envelope },
    update: envelope,
  });
}

let storedKeyCompatibilityCheck: Promise<void> | undefined;

export function assertStoredPersonalIdentityNumberKeysAvailable(): Promise<void> {
  storedKeyCompatibilityCheck ??= (async () => {
    const [legacyClient, storedEnvelopes] = await Promise.all([
      prisma.client.findFirst({
        where: { personalIdentityNumberLegacyPlaintext: { not: null } },
        select: { id: true },
      }),
      prisma.$queryRaw<
        Array<
          PersonalIdentityNumberEnvelope & {
            organisationId: string;
            clientId: string;
          }
        >
      >`
        SELECT DISTINCT ON ("encryptionVersion", "keyId")
          "organisationId",
          "clientId",
          "encryptionVersion",
          "keyId",
          "nonce",
          "ciphertext",
          "authenticationTag"
        FROM "clientPersonalIdentityNumber"
        ORDER BY "encryptionVersion", "keyId", "clientId"
      `,
    ]);
    if (legacyClient) {
      throw new Error("Stored Personnummer transition is incomplete.");
    }

    const configuredKeys = keyring().keys;
    if (
      storedEnvelopes.some(
        ({ encryptionVersion, keyId }) =>
          encryptionVersion !== PERSONAL_IDENTITY_NUMBER_ENCRYPTION_VERSION ||
          !configuredKeys.has(keyId),
      )
    ) {
      throw new Error("Stored Personnummer encryption is incompatible.");
    }

    for (const { organisationId, clientId, ...envelope } of storedEnvelopes) {
      decryptEnvelope({ organisationId, clientId }, envelope);
    }
  })();
  return storedKeyCompatibilityCheck;
}

export function resetStoredPersonalIdentityNumberKeyCheckForTest(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Stored-key cache reset is available only in tests.");
  }
  storedKeyCompatibilityCheck = undefined;
}
