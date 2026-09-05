import { createSecretKey, randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { convertLegacyPersonalIdentityNumbers } from "../../../scripts/convert-legacy-personal-identity-numbers";
import { prisma } from "../../lib/prisma";
import {
  assertStoredPersonalIdentityNumberKeysAvailable,
  readPersonalIdentityNumber,
  resetStoredPersonalIdentityNumberKeyCheckForTest,
  writePersonalIdentityNumber,
} from "./personal-identity-number";
import { encryptPersonalIdentityNumber } from "./personal-identity-number-crypto";

const organisationIds = new Set<string>();

afterEach(async () => {
  resetStoredPersonalIdentityNumberKeyCheckForTest();
  const ids = [...organisationIds];
  await prisma.clientPersonalIdentityNumber.deleteMany({
    where: { organisationId: { in: ids } },
  });
  await prisma.client.deleteMany({
    where: { organisationId: { in: ids } },
  });
  await prisma.organisation.deleteMany({ where: { id: { in: ids } } });
  organisationIds.clear();
});

async function createClient(legacy: string | null = null) {
  const organisationId = randomUUID();
  const clientId = randomUUID();
  organisationIds.add(organisationId);
  await prisma.organisation.create({
    data: { id: organisationId, name: "Fiktiv krypteringsorganisation" },
  });
  await prisma.client.create({
    data: {
      id: clientId,
      organisationId,
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: `FIKTIV-${clientId}`,
      personalIdentityNumberLegacyPlaintext: legacy,
      category: "ADULT",
    },
  });
  return { organisationId, clientId };
}

describe("encrypted Personnummer storage with PostgreSQL", () => {
  it("stores only an authenticated envelope and decrypts for an exact scope", async () => {
    const scope = await createClient();
    await writePersonalIdentityNumber(prisma, scope, "20000101-1234");

    await expect(readPersonalIdentityNumber(prisma, scope)).resolves.toBe(
      "20000101-1234",
    );
    const stored = await prisma.clientPersonalIdentityNumber.findUniqueOrThrow({
      where: { organisationId_clientId: scope },
    });
    expect(stored.nonce).toHaveLength(12);
    expect(stored.authenticationTag).toHaveLength(16);
    expect(Buffer.from(stored.ciphertext).toString("utf8")).not.toContain(
      "20000101-1234",
    );
    await expect(
      readPersonalIdentityNumber(prisma, {
        ...scope,
        organisationId: randomUUID(),
      }),
    ).resolves.toBeNull();
  });

  it("fails the cached database compatibility check for an unknown stored key", async () => {
    const scope = await createClient();
    await prisma.clientPersonalIdentityNumber.create({
      data: {
        ...scope,
        encryptionVersion: 1,
        keyId: "unknown-fictional-key",
        nonce: new Uint8Array(12),
        ciphertext: new Uint8Array([1]),
        authenticationTag: new Uint8Array(16),
      },
    });

    const first = assertStoredPersonalIdentityNumberKeysAvailable();
    const second = assertStoredPersonalIdentityNumberKeysAvailable();
    expect(second).toBe(first);
    await expect(first).rejects.toThrow(
      "Personnummer encryption is incompatible",
    );
  });

  it("fails readiness while legacy plaintext remains pending conversion", async () => {
    await createClient("20000101-1234");

    await expect(
      assertStoredPersonalIdentityNumberKeysAvailable(),
    ).rejects.toThrow("Personnummer transition is incomplete");
  });

  it("authenticates stored ciphertext and rejects wrong bytes under a known key ID", async () => {
    const scope = await createClient();
    const envelope = encryptPersonalIdentityNumber(
      "20000101-1234",
      scope,
      "fictional-test-key",
      createSecretKey(Buffer.alloc(32, 2)),
    );
    await prisma.clientPersonalIdentityNumber.create({
      data: { ...scope, ...envelope },
    });

    await expect(
      assertStoredPersonalIdentityNumberKeysAvailable(),
    ).rejects.toThrow();
  });

  it("accepts and decrypts a retained non-active key", async () => {
    const scope = await createClient();
    const envelope = encryptPersonalIdentityNumber(
      "20000101-1234",
      scope,
      "fictional-old-test-key",
      createSecretKey(Buffer.alloc(32, 1)),
    );
    await prisma.clientPersonalIdentityNumber.create({
      data: { ...scope, ...envelope },
    });

    await expect(
      assertStoredPersonalIdentityNumberKeysAvailable(),
    ).resolves.toBeUndefined();
    await expect(readPersonalIdentityNumber(prisma, scope)).resolves.toBe(
      "20000101-1234",
    );
  });

  it("rejects malformed envelope lengths at the database boundary", async () => {
    const scope = await createClient();
    await expect(
      prisma.clientPersonalIdentityNumber.create({
        data: {
          ...scope,
          encryptionVersion: 1,
          keyId: "fictional-test-key",
          nonce: new Uint8Array(11),
          ciphertext: new Uint8Array([1]),
          authenticationTag: new Uint8Array(16),
        },
      }),
    ).rejects.toBeDefined();
  });

  it("converts legacy plaintext atomically and is idempotent", async () => {
    const scope = await createClient("20000101-1234");

    await expect(convertLegacyPersonalIdentityNumbers(prisma)).resolves.toEqual(
      { discovered: 1, converted: 1, reconciled: 0 },
    );
    await expect(readPersonalIdentityNumber(prisma, scope)).resolves.toBe(
      "20000101-1234",
    );
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: scope.clientId } }),
    ).resolves.toMatchObject({
      personalIdentityNumberLegacyPlaintext: null,
    });
    await expect(convertLegacyPersonalIdentityNumbers(prisma)).resolves.toEqual(
      { discovered: 0, converted: 0, reconciled: 0 },
    );
  });

  it("rejects conflicting legacy and encrypted values without partial changes", async () => {
    const scope = await createClient("20000101-1234");
    await writePersonalIdentityNumber(prisma, scope, "19990101-9999");

    await expect(convertLegacyPersonalIdentityNumbers(prisma)).rejects.toThrow(
      "conflicts",
    );
    await expect(readPersonalIdentityNumber(prisma, scope)).resolves.toBe(
      "19990101-9999",
    );
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: scope.clientId } }),
    ).resolves.toMatchObject({
      personalIdentityNumberLegacyPlaintext: "20000101-1234",
    });
  });

  it("reconciles a matching envelope and clears only the locked legacy source", async () => {
    const scope = await createClient("20000101-1234");
    await writePersonalIdentityNumber(prisma, scope, "20000101-1234");

    await expect(convertLegacyPersonalIdentityNumbers(prisma)).resolves.toEqual(
      { discovered: 1, converted: 0, reconciled: 1 },
    );
    await expect(readPersonalIdentityNumber(prisma, scope)).resolves.toBe(
      "20000101-1234",
    );
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: scope.clientId } }),
    ).resolves.toMatchObject({ personalIdentityNumberLegacyPlaintext: null });
  });

  it("preserves legacy plaintext when the stored key is unavailable", async () => {
    const scope = await createClient("20000101-1234");
    await prisma.clientPersonalIdentityNumber.create({
      data: {
        ...scope,
        encryptionVersion: 1,
        keyId: "unknown-fictional-key",
        nonce: new Uint8Array(12),
        ciphertext: new Uint8Array([1]),
        authenticationTag: new Uint8Array(16),
      },
    });

    await expect(convertLegacyPersonalIdentityNumbers(prisma)).rejects.toThrow(
      "key is unavailable",
    );
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: scope.clientId } }),
    ).resolves.toMatchObject({
      personalIdentityNumberLegacyPlaintext: "20000101-1234",
    });
  });
});
