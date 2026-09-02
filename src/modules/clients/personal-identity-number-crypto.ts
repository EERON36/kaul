import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type KeyObject,
} from "node:crypto";

export const PERSONAL_IDENTITY_NUMBER_ENCRYPTION_VERSION = 1;
export const PERSONAL_IDENTITY_NUMBER_NONCE_BYTES = 12;
export const PERSONAL_IDENTITY_NUMBER_AUTH_TAG_BYTES = 16;

export type PersonalIdentityNumberScope = Readonly<{
  organisationId: string;
  clientId: string;
}>;

export type PersonalIdentityNumberEnvelope = Readonly<{
  encryptionVersion: number;
  keyId: string;
  nonce: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
  authenticationTag: Uint8Array<ArrayBuffer>;
}>;

export function personalIdentityNumberAdditionalAuthenticatedData(
  scope: PersonalIdentityNumberScope,
  encryptionVersion: number,
  keyId: string,
): Buffer {
  return Buffer.from(
    JSON.stringify([
      "kaul",
      "client.personalIdentityNumber",
      encryptionVersion,
      keyId,
      scope.organisationId,
      scope.clientId,
    ]),
    "utf8",
  );
}

export function encryptPersonalIdentityNumber(
  plaintext: string,
  scope: PersonalIdentityNumberScope,
  keyId: string,
  key: KeyObject,
): PersonalIdentityNumberEnvelope {
  const nonce = new Uint8Array(
    randomBytes(PERSONAL_IDENTITY_NUMBER_NONCE_BYTES),
  );
  const cipher = createCipheriv("aes-256-gcm", key, nonce, {
    authTagLength: PERSONAL_IDENTITY_NUMBER_AUTH_TAG_BYTES,
  });
  cipher.setAAD(
    personalIdentityNumberAdditionalAuthenticatedData(
      scope,
      PERSONAL_IDENTITY_NUMBER_ENCRYPTION_VERSION,
      keyId,
    ),
  );
  const ciphertext = new Uint8Array(
    Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]),
  );

  return {
    encryptionVersion: PERSONAL_IDENTITY_NUMBER_ENCRYPTION_VERSION,
    keyId,
    nonce,
    ciphertext,
    authenticationTag: new Uint8Array(cipher.getAuthTag()),
  };
}

export function decryptPersonalIdentityNumber(
  envelope: PersonalIdentityNumberEnvelope,
  scope: PersonalIdentityNumberScope,
  key: KeyObject,
): string {
  if (
    envelope.encryptionVersion !==
      PERSONAL_IDENTITY_NUMBER_ENCRYPTION_VERSION ||
    envelope.nonce.byteLength !== PERSONAL_IDENTITY_NUMBER_NONCE_BYTES ||
    envelope.authenticationTag.byteLength !==
      PERSONAL_IDENTITY_NUMBER_AUTH_TAG_BYTES ||
    envelope.ciphertext.byteLength === 0
  ) {
    throw new Error("Unsupported or malformed Personnummer envelope.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, envelope.nonce, {
    authTagLength: PERSONAL_IDENTITY_NUMBER_AUTH_TAG_BYTES,
  });
  decipher.setAAD(
    personalIdentityNumberAdditionalAuthenticatedData(
      scope,
      envelope.encryptionVersion,
      envelope.keyId,
    ),
  );
  decipher.setAuthTag(envelope.authenticationTag);
  return Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
