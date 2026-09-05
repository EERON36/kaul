# ADR 0003: Personnummer envelope encryption

## Status

Accepted for Stage A implementation. Production conversion and key creation
remain owner-attended operational gates.

## Decision

Personnummer is stored separately from ordinary Client data in the one-to-one
`clientPersonalIdentityNumber` table. The table contains only Organisation and
Client ownership plus a versioned AES-256-GCM envelope: key ID, 12-byte random
nonce, ciphertext, and full 16-byte authentication tag. There is no plaintext,
searchable hash, deterministic encryption, unique constraint, or query feature.

Version 1 authenticates this canonical UTF-8 JSON array as additional data:

```text
["kaul","client.personalIdentityNumber",1,keyId,organisationId,clientId]
```

The Organisation and Client IDs come from the authorised server-side record.
Changing the stored scope, version, or key ID therefore invalidates the record.

The keyring is a strict versioned JSON file outside Git. It names one active
encryption key and may retain older decryption keys. Every key is exactly 32
bytes encoded as canonical, unpadded base64url. The application receives only
an absolute file path. Unknown stored keys, invalid files, malformed envelopes,
and authentication failures fail closed without logging values or key material.
Startup readiness is also denied while any legacy plaintext awaits conversion.
For every stored version/key-ID pair, the cached readiness check authenticates
one representative envelope with its configured key. This detects a missing or
wrong same-ID key without decrypting every Personnummer on ordinary health
requests.

Ordinary Client lists, search, workspace projections, logs, URLs, and audit
metadata never select or decrypt Personnummer. The ordinary detail view exposes
only whether a value exists. Full plaintext is available only through the
existing Administrator edit/retrieval boundary. Writes share the Client and
audit transaction.

## Migration stages

Stage A renames the existing nullable plaintext column to
`personalIdentityNumberLegacyPlaintext`, creates the envelope table, and moves
all new application reads and writes to encryption. No automatic data rewrite
occurs in the schema migration.

Stage B is an explicit owner-attended, restart-safe converter. For each locked
legacy row it writes and decrypt-verifies the envelope, then clears plaintext in
the same transaction. Matching pre-existing envelopes are reconciled;
conflicts, unknown keys, unsupported versions, or malformed records stop without
clearing the source. Output contains counts only.

Stage C, removal of the legacy column, requires separate approval after every
environment and relevant backup has passed conversion and restore verification.
It is intentionally absent from Stage A.

## Key custody and recovery

Pilot mounts the host keyring read-only into only the Kaul application and its
private restore-check service. The non-root runtime must be able to read it; the
host file is never group- or world-readable. Rotation adds a new active key,
retains every key needed by live rows and retained backups, and later performs a
separate attended re-encryption operation. Deleting an old key before matching
backup expiry makes those backups unrecoverable.

Database backups contain encrypted envelopes, not usable decryption keys.
Keyring backup, access control, escrow, rotation, and destruction are separate
owner-controlled procedures.

Client Documents remain a future client-scoped requirement at
`/klienter/[clientId]/dokument`, inside the Client workspace. They must reuse
central Organisation, Client, Assignment, and archived-Client authorisation;
archived content must remain non-mutable where appropriate. This decision does
not implement uploads or document encryption.
