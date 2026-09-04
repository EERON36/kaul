import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { getEnvironment } from "../src/lib/environment";
import {
  readPersonalIdentityNumber,
  writePersonalIdentityNumber,
} from "../src/modules/clients/personal-identity-number";
import { lockClientForMutation } from "../src/modules/clients/client-mutation-lock";

type LegacyClient = Readonly<{
  organisationId: string;
  clientId: string;
}>;

export type LegacyPersonalIdentityNumberConversionResult = Readonly<{
  discovered: number;
  converted: number;
  reconciled: number;
}>;

export async function convertLegacyPersonalIdentityNumbers(
  prisma: PrismaClient,
): Promise<LegacyPersonalIdentityNumberConversionResult> {
  const candidates = await prisma.$queryRaw<LegacyClient[]>`
    SELECT
      "organisationId",
      "id" AS "clientId"
    FROM "client"
    WHERE "personalIdentityNumberLegacyPlaintext" IS NOT NULL
    ORDER BY "organisationId", "id"
  `;
  let converted = 0;
  let reconciled = 0;

  for (const candidate of candidates) {
    const result = await prisma.$transaction(async (transaction) => {
      await lockClientForMutation(transaction, candidate.clientId);
      const rows = await transaction.$queryRaw<
        Array<{ personalIdentityNumberLegacyPlaintext: string | null }>
      >`
        SELECT "personalIdentityNumberLegacyPlaintext"
        FROM "client"
        WHERE "organisationId" = ${candidate.organisationId}
          AND "id" = ${candidate.clientId}::uuid
        FOR UPDATE
      `;
      const legacy = rows[0]?.personalIdentityNumberLegacyPlaintext;
      if (legacy === null || legacy === undefined) return "skipped" as const;

      const scope = candidate;
      const existing = await readPersonalIdentityNumber(transaction, scope);
      if (existing !== null && existing !== legacy) {
        throw new Error(
          "Legacy Personnummer conflicts with the encrypted record.",
        );
      }

      if (existing === null) {
        await writePersonalIdentityNumber(transaction, scope, legacy);
        const verified = await readPersonalIdentityNumber(transaction, scope);
        if (verified !== legacy) {
          throw new Error("Personnummer conversion verification failed.");
        }
      }

      const cleared = await transaction.client.updateMany({
        where: {
          organisationId: candidate.organisationId,
          id: candidate.clientId,
          personalIdentityNumberLegacyPlaintext: legacy,
        },
        data: { personalIdentityNumberLegacyPlaintext: null },
      });
      if (cleared.count !== 1) {
        throw new Error("Personnummer conversion lost its locked source row.");
      }
      return existing === null
        ? ("converted" as const)
        : ("reconciled" as const);
    });

    if (result === "converted") converted += 1;
    if (result === "reconciled") reconciled += 1;
  }

  return { discovered: candidates.length, converted, reconciled };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).join(" ") !== "--confirm-stage-b") {
    throw new Error(
      "Conversion requires the explicit --confirm-stage-b operator flag.",
    );
  }

  const environment = getEnvironment();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });
  try {
    const result = await convertLegacyPersonalIdentityNumbers(prisma);
    process.stdout.write(
      `Personnummer conversion completed: discovered=${result.discovered}, converted=${result.converted}, reconciled=${result.reconciled}.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]?.replaceAll("\\", "/");
  return (
    entry?.endsWith("/convert-legacy-personal-identity-numbers.ts") ?? false
  );
}

if (isDirectExecution()) {
  void main().catch(() => {
    process.stderr.write(
      "Personnummer conversion failed. No values were logged.\n",
    );
    process.exitCode = 1;
  });
}
