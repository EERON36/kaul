-- Stage A keeps legacy plaintext only as an explicit, temporary conversion
-- source. A later, separately reviewed Stage C migration will remove it after
-- every environment has completed and verified the attended conversion.
ALTER TABLE "client"
    RENAME COLUMN "personalIdentityNumber" TO "personalIdentityNumberLegacyPlaintext";

CREATE TABLE "clientPersonalIdentityNumber" (
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "encryptionVersion" SMALLINT NOT NULL,
    "keyId" VARCHAR(64) NOT NULL,
    "nonce" BYTEA NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "authenticationTag" BYTEA NOT NULL,

    CONSTRAINT "clientPersonalIdentityNumber_pkey"
        PRIMARY KEY ("organisationId", "clientId"),
    CONSTRAINT "clientPersonalIdentityNumber_envelope_check" CHECK (
        "encryptionVersion" = 1
        AND octet_length("nonce") = 12
        AND octet_length("authenticationTag") = 16
        AND octet_length("ciphertext") > 0
    )
);

ALTER TABLE "clientPersonalIdentityNumber"
    ADD CONSTRAINT "clientPersonalIdentityNumber_scope_client_fkey"
    FOREIGN KEY ("organisationId", "clientId")
    REFERENCES "client"("organisationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
