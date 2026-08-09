import "dotenv/config";

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { prisma } from "../src/lib/prisma";
import { recoverInitialAdministratorBootstrap } from "../src/modules/users/initial-administrator";

const SUCCESS =
  "Bootstrap operation marked as reviewed and failed. Run npm run bootstrap:admin separately to start a new bootstrap.\n";
const FAILURE =
  "Bootstrap recovery failed closed. Review the operation and installation state.\n";

export async function runBootstrapRecoveryCli(
  args: readonly string[],
): Promise<void> {
  if (args.length !== 1) throw new Error(FAILURE);
  await recoverInitialAdministratorBootstrap(args[0]!);
  process.stdout.write(SUCCESS);
}

const entryPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

async function main(): Promise<void> {
  try {
    await runBootstrapRecoveryCli(process.argv.slice(2));
  } catch {
    process.stderr.write(FAILURE);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {
      process.exitCode = 1;
    });
  }
}

if (entryPath === import.meta.url) void main();
