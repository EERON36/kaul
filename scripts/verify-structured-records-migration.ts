import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { getTestEnvironment } from "../src/test/test-environment";

const FEATURE_MIGRATION =
  "20260901090000_add_structured_records_and_monthly_reports";
const LEGACY_CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const LEGACY_ENTRY_ID = "22222222-2222-4222-8222-222222222222";
const LEGACY_CONTENT = "Äldre signerad rad ett.\n\nÄldre signerad rad två.";

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
    throw new Error(
      `Migration SQL execution failed for ${file}: ${result.stderr || result.stdout}`,
    );
  }
}

async function main(): Promise<void> {
  const environment = getTestEnvironment();
  const migrationRoot = resolve("prisma/migrations");
  const migrationDirectories = (
    await readdir(migrationRoot, {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!migrationDirectories.includes(FEATURE_MIGRATION)) {
    throw new Error("The structured-records feature migration is missing.");
  }

  for (const migration of migrationDirectories) {
    if (migration === FEATURE_MIGRATION) break;
    executeSqlFile(
      join(migrationRoot, migration, "migration.sql"),
      environment.databaseUrl,
    );
  }

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "kaul-structured-migration-"),
  );
  try {
    const fixtureFile = join(temporaryDirectory, "legacy-fixture.sql");
    await writeFile(
      fixtureFile,
      `
INSERT INTO "organisation" ("id", "name", "createdAt", "updatedAt")
VALUES ('migration-org', 'Fiktiv migrationsorganisation', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "user" (
  "id", "name", "email", "emailVerified", "createdAt", "updatedAt",
  "role", "banned", "organisationId", "professionalTitle",
  "mustChangePassword"
) VALUES (
  'migration-user', 'Fiktiv migrationsanvändare',
  'migration-user@example.test', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'STAFF_MEMBER', false, 'migration-org', 'Fiktiv yrkestitel', false
);

INSERT INTO "client" (
  "id", "organisationId", "firstName", "lastName", "personIdentifier",
  "category", "status", "createdAt", "updatedAt"
) VALUES (
  '${LEGACY_CLIENT_ID}', 'migration-org', 'Fiktiv', 'Migrationsklient',
  'MIGRATION-LEGACY-01', 'ADULT', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

ALTER TABLE "journalEntry" DISABLE TRIGGER USER;
INSERT INTO "journalEntry" (
  "id", "reference", "organisationId", "clientId", "authorUserId",
  "status", "entryType", "eventOccurredAt", "content", "version",
  "createdAt", "updatedAt", "signedAt", "signerUserId", "signerName",
  "signerProfessionalTitle", "signerRole"
) VALUES (
  '${LEGACY_ENTRY_ID}', 'JRN-22222222-2222-4222-8222-222222222222',
  'migration-org', '${LEGACY_CLIENT_ID}', 'migration-user', 'SIGNED',
  'DAILY_NOTE', '2026-08-31T08:00:00Z', $legacy$${LEGACY_CONTENT}$legacy$, 2,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'migration-user',
  'Fiktiv migrationsanvändare', 'Fiktiv yrkestitel', 'STAFF_MEMBER'
);
ALTER TABLE "journalEntry" ENABLE TRIGGER USER;
`,
      "utf8",
    );
    executeSqlFile(fixtureFile, environment.databaseUrl);
    executeSqlFile(
      join(migrationRoot, FEATURE_MIGRATION, "migration.sql"),
      environment.databaseUrl,
    );
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
  });
  try {
    const [client, entry, reportTable, journalConstraint] = await Promise.all([
      prisma.client.findUniqueOrThrow({ where: { id: LEGACY_CLIENT_ID } }),
      prisma.journalEntry.findUniqueOrThrow({
        where: { id: LEGACY_ENTRY_ID },
      }),
      prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT to_regclass('public."monthlyReport"') IS NOT NULL AS "exists"
      `,
      prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = '"journalEntry"'::regclass
            AND conname = 'journalEntry_signing_state_check'
        ) AS "exists"
      `,
    ]);
    if (
      client.personalIdentityNumber !== null ||
      client.placingUnit !== null ||
      client.legalBasis !== null ||
      client.responsibleSocialWorkerName !== null ||
      client.responsibleSocialWorkerPhone !== null ||
      client.responsibleSocialWorkerEmail !== null ||
      entry.contentFormat !== "LEGACY_NARRATIVE" ||
      entry.content !== LEGACY_CONTENT ||
      entry.healthContent !== null ||
      entry.educationOccupationContent !== null ||
      entry.emotionsBehaviorContent !== null ||
      entry.socialRelationsContent !== null ||
      entry.dailyLivingIndependenceContent !== null ||
      entry.otherContent !== null ||
      reportTable[0]?.exists !== true ||
      journalConstraint[0]?.exists !== true
    ) {
      throw new Error(
        "The feature migration did not preserve the realistic legacy fixture.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  process.stdout.write(
    `Verified ${FEATURE_MIGRATION} against a realistic pre-feature legacy record in ${environment.databaseName}.\n`,
  );
}

await main();
