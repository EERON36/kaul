import { readFileSync } from "node:fs";

import { loadPersonalIdentityNumberKeyring } from "../src/lib/personal-identity-number-keyring";
import {
  decryptPersonalIdentityNumber,
  encryptPersonalIdentityNumber,
} from "../src/modules/clients/personal-identity-number-crypto";

const scope = {
  organisationId: "fictional-backup-organisation",
  clientId: "41111111-1111-4111-8111-111111111111",
};
const fictionalPlaintext = "20000101-1234";

function keyring() {
  const path = process.env.KAUL_PERSONNUMMER_KEYRING_FILE;
  if (!path) throw new Error("Backup verification keyring path is missing.");
  return loadPersonalIdentityNumberKeyring(path);
}

function bytea(value: Uint8Array): string {
  return `\\x${Buffer.from(value).toString("hex")}`;
}

function createFixtureSql(): void {
  const current = keyring();
  const key = current.keys.get(current.activeKeyId);
  if (!key) throw new Error("Backup verification active key is missing.");
  const envelope = encryptPersonalIdentityNumber(
    fictionalPlaintext,
    scope,
    current.activeKeyId,
    key,
  );
  process.stdout.write(`
CREATE TABLE "clientPersonalIdentityNumber" (
  "organisationId" text NOT NULL,
  "clientId" uuid NOT NULL,
  "encryptionVersion" smallint NOT NULL,
  "keyId" varchar(64) NOT NULL,
  "nonce" bytea NOT NULL,
  "ciphertext" bytea NOT NULL,
  "authenticationTag" bytea NOT NULL,
  PRIMARY KEY ("organisationId", "clientId")
);
INSERT INTO "clientPersonalIdentityNumber" VALUES (
  '${scope.organisationId}', '${scope.clientId}',
  ${envelope.encryptionVersion}, '${envelope.keyId}',
  '${bytea(envelope.nonce)}', '${bytea(envelope.ciphertext)}',
  '${bytea(envelope.authenticationTag)}'
);
`);
}

function verifyRestoredFixture(): void {
  const serialized = readFileSync(0, "utf8").trim();
  const value = JSON.parse(serialized) as {
    encryptionVersion: number;
    keyId: string;
    nonce: string;
    ciphertext: string;
    authenticationTag: string;
  };
  const current = keyring();
  const key = current.keys.get(value.keyId);
  if (!key) throw new Error("Backup verification key is unavailable.");
  const decrypted = decryptPersonalIdentityNumber(
    {
      encryptionVersion: value.encryptionVersion,
      keyId: value.keyId,
      nonce: new Uint8Array(Buffer.from(value.nonce, "base64")),
      ciphertext: new Uint8Array(Buffer.from(value.ciphertext, "base64")),
      authenticationTag: new Uint8Array(
        Buffer.from(value.authenticationTag, "base64"),
      ),
    },
    scope,
    key,
  );
  if (decrypted !== fictionalPlaintext) {
    throw new Error("Restored Personnummer did not verify.");
  }
  process.stdout.write("Restored encrypted Personnummer verified.\n");
}

try {
  if (process.argv[2] === "create-fixture") createFixtureSql();
  else if (process.argv[2] === "verify-fixture") verifyRestoredFixture();
  else throw new Error("Unknown backup verification mode.");
} catch {
  process.stderr.write("Encrypted Personnummer backup verification failed.\n");
  process.exitCode = 1;
}
