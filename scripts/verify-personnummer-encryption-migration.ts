import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { readPersonalIdentityNumber } from "../src/modules/clients/personal-identity-number";
import { getTestEnvironment } from "../src/test/test-environment";
import { convertLegacyPersonalIdentityNumbers } from "./convert-legacy-personal-identity-numbers";

const STAGE_A_MIGRATION =
  "20260902120000_encrypt_client_personal_identity_number";
const CLIENT_ID = "31111111-1111-4111-8111-111111111111";
const JOURNAL_ID = "32222222-2222-4222-8222-222222222222";
const LEGACY_VALUE = "20000101-1234";
const SIGNED_CONTENT = "Oförändrad fiktiv signerad historik.";

function executeSqlFile(file: string, databaseUrl: string): void {
  const prismaCli = resolve("node_modules/prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [prismaCli, "db", "execute", "--file", file],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl },
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    throw new Error("Personnummer migration SQL execution failed.");
  }
}

async function main(): Promise<void> {
  const environment = getTestEnvironment();
  const migrationRoot = resolve("prisma/migrations");
  const migrations = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!migrations.includes(STAGE_A_MIGRATION)) {
    throw new Error("The Personnummer Stage A migration is missing.");
  }

  for (const migration of migrations) {
    if (migration === STAGE_A_MIGRATION) break;
    executeSqlFile(
      join(migrationRoot, migration, "migration.sql"),
      environment.databaseUrl,
    );
  }

  const directory = await mkdtemp(
    join(tmpdir(), "kaul-personnummer-migration-"),
  );
  try {
    const fixture = join(directory, "fixture.sql");
    await writeFile(
      fixture,
      `
INSERT INTO "organisation" ("id", "name", "createdAt", "updatedAt")
VALUES ('personnummer-migration-org', 'Fiktiv organisation', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "user" (
  "id", "name", "email", "emailVerified", "createdAt", "updatedAt",
  "role", "banned", "organisationId", "professionalTitle", "mustChangePassword"
) VALUES (
  'personnummer-migration-user', 'Fiktiv användare',
  'personnummer-migration@example.test', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'STAFF_MEMBER', false, 'personnummer-migration-org', 'Fiktiv titel', false
);

INSERT INTO "client" (
  "id", "organisationId", "firstName", "lastName", "personIdentifier",
  "personalIdentityNumber", "placingUnit", "category", "status",
  "createdAt", "updatedAt"
) VALUES (
  '${CLIENT_ID}', 'personnummer-migration-org', 'Fiktiv', 'Migrationsklient',
  'PIN-MIGRATION-01', '${LEGACY_VALUE}', 'Oförändrad enhet', 'ADULT', 'ACTIVE',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

ALTER TABLE "journalEntry" DISABLE TRIGGER USER;
INSERT INTO "journalEntry" (
  "id", "reference", "organisationId", "clientId", "authorUserId",
  "status", "entryType", "eventOccurredAt", "content", "contentFormat",
  "version", "createdAt", "updatedAt", "signedAt", "signerUserId",
  "signerName", "signerProfessionalTitle", "signerRole"
) VALUES (
  '${JOURNAL_ID}', 'JRN-32222222-2222-4222-8222-222222222222',
  'personnummer-migration-org', '${CLIENT_ID}', 'personnummer-migration-user',
  'SIGNED', 'DAILY_NOTE', '2026-09-01T08:00:00Z',
  $signed$${SIGNED_CONTENT}$signed$, 'LEGACY_NARRATIVE', 2,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'personnummer-migration-user', 'Fiktiv användare', 'Fiktiv titel', 'STAFF_MEMBER'
);
ALTER TABLE "journalEntry" ENABLE TRIGGER USER;
`,
      "utf8",
    );
    executeSqlFile(fixture, environment.databaseUrl);
    executeSqlFile(
      join(migrationRoot, STAGE_A_MIGRATION, "migration.sql"),
      environment.databaseUrl,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
  });
  try {
    const before = await prisma.client.findUniqueOrThrow({
      where: { id: CLIENT_ID },
    });
    if (before.personalIdentityNumberLegacyPlaintext !== LEGACY_VALUE) {
      throw new Error("Stage A did not preserve the conversion source.");
    }

    const first = await convertLegacyPersonalIdentityNumbers(prisma);
    const second = await convertLegacyPersonalIdentityNumbers(prisma);
    const scope = {
      organisationId: "personnummer-migration-org",
      clientId: CLIENT_ID,
    };
    const [client, envelope, decrypted, journal] = await Promise.all([
      prisma.client.findUniqueOrThrow({ where: { id: CLIENT_ID } }),
      prisma.clientPersonalIdentityNumber.findUniqueOrThrow({
        where: { organisationId_clientId: scope },
      }),
      readPersonalIdentityNumber(prisma, scope),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: JOURNAL_ID } }),
    ]);
    if (
      first.converted !== 1 ||
      second.discovered !== 0 ||
      client.personalIdentityNumberLegacyPlaintext !== null ||
      client.placingUnit !== "Oförändrad enhet" ||
      envelope.encryptionVersion !== 1 ||
      envelope.nonce.byteLength !== 12 ||
      envelope.authenticationTag.byteLength !== 16 ||
      decrypted !== LEGACY_VALUE ||
      journal.content !== SIGNED_CONTENT ||
      journal.status !== "SIGNED"
    ) {
      throw new Error("Personnummer Stage A rehearsal did not preserve data.");
    }
  } finally {
    await prisma.$disconnect();
  }

  process.stdout.write(
    `Verified ${STAGE_A_MIGRATION}, conversion, and idempotent rerun with fictional data.\n`,
  );
}

void main().catch(() => {
  process.stderr.write("Personnummer migration rehearsal failed.\n");
  process.exitCode = 1;
});
