import { createSecretKey } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decryptPersonalIdentityNumber,
  encryptPersonalIdentityNumber,
  PERSONAL_IDENTITY_NUMBER_AUTH_TAG_BYTES,
  PERSONAL_IDENTITY_NUMBER_NONCE_BYTES,
} from "./personal-identity-number-crypto";

const key = createSecretKey(Buffer.alloc(32, 7));
const scope = {
  organisationId: "fictional-organisation",
  clientId: "10000000-0000-4000-8000-000000000001",
};
const plaintext = "20000101-1234";

describe("Personnummer encryption", () => {
  it("round-trips with a fresh standard GCM nonce and full authentication tag", () => {
    const first = encryptPersonalIdentityNumber(
      plaintext,
      scope,
      "fictional-key",
      key,
    );
    const second = encryptPersonalIdentityNumber(
      plaintext,
      scope,
      "fictional-key",
      key,
    );

    expect(first.nonce).toHaveLength(PERSONAL_IDENTITY_NUMBER_NONCE_BYTES);
    expect(first.authenticationTag).toHaveLength(
      PERSONAL_IDENTITY_NUMBER_AUTH_TAG_BYTES,
    );
    expect(Buffer.from(first.nonce).equals(second.nonce)).toBe(false);
    expect(Buffer.from(first.ciphertext).equals(second.ciphertext)).toBe(false);
    expect(decryptPersonalIdentityNumber(first, scope, key)).toBe(plaintext);
  });

  it.each([
    ["organisation", { ...scope, organisationId: "other-organisation" }],
    ["client", { ...scope, clientId: "20000000-0000-4000-8000-000000000002" }],
  ])("binds ciphertext to the authoritative %s scope", (_label, wrongScope) => {
    const envelope = encryptPersonalIdentityNumber(
      plaintext,
      scope,
      "fictional-key",
      key,
    );
    expect(() =>
      decryptPersonalIdentityNumber(envelope, wrongScope, key),
    ).toThrow();
  });

  it.each(["nonce", "ciphertext", "authenticationTag"] as const)(
    "rejects tampered %s without disclosing plaintext",
    (field) => {
      const envelope = encryptPersonalIdentityNumber(
        plaintext,
        scope,
        "fictional-key",
        key,
      );
      const tampered = Buffer.from(envelope[field]);
      tampered[0] ^= 1;

      let error: unknown;
      try {
        decryptPersonalIdentityNumber(
          { ...envelope, [field]: tampered },
          scope,
          key,
        );
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain(plaintext);
    },
  );

  it("rejects unsupported versions and malformed envelope lengths", () => {
    const envelope = encryptPersonalIdentityNumber(
      plaintext,
      scope,
      "fictional-key",
      key,
    );
    expect(() =>
      decryptPersonalIdentityNumber(
        { ...envelope, encryptionVersion: 2 },
        scope,
        key,
      ),
    ).toThrow("Unsupported or malformed");
    expect(() =>
      decryptPersonalIdentityNumber(
        { ...envelope, authenticationTag: Buffer.alloc(15) },
        scope,
        key,
      ),
    ).toThrow("Unsupported or malformed");
  });

  it("rejects a changed key ID and a different key", () => {
    const envelope = encryptPersonalIdentityNumber(
      plaintext,
      scope,
      "fictional-key",
      key,
    );
    expect(() =>
      decryptPersonalIdentityNumber(
        { ...envelope, keyId: "other-key" },
        scope,
        key,
      ),
    ).toThrow();
    expect(() =>
      decryptPersonalIdentityNumber(
        envelope,
        scope,
        createSecretKey(Buffer.alloc(32, 8)),
      ),
    ).toThrow();
  });
});
