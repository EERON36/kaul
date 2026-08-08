import "dotenv/config";

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";

import { ZodError } from "zod";

import { prisma } from "../src/lib/prisma";
import {
  bootstrapInitialAdministrator,
  InitialAdministratorBootstrapError,
  type InitialAdministratorBootstrapResult,
} from "../src/modules/users/initial-administrator";

const BOOTSTRAP_CLI_ERROR_MESSAGES = {
  INCOMPLETE_METADATA:
    "Bootstrap input ended before all metadata was provided.",
  INVALID_METADATA: "Initial Administrator metadata is invalid.",
  INSTALLATION_NOT_EMPTY:
    "Initial Administrator bootstrap requires an empty installation.",
  UNEXPECTED: "Initial Administrator bootstrap failed.",
} as const;

class BootstrapCliInputError extends Error {
  readonly code = "INCOMPLETE_METADATA";

  constructor() {
    super(BOOTSTRAP_CLI_ERROR_MESSAGES.INCOMPLETE_METADATA);
  }
}

export function formatBootstrapSuccess(
  result: InitialAdministratorBootstrapResult,
): string {
  return [
    "Initial Administrator created.",
    `Organisation: ${result.organisationName}`,
    `Administrator email: ${result.administratorEmail}`,
    `Temporary credential: ${result.temporaryCredential}`,
    `Expires: ${result.temporaryCredentialExpiresAt.toISOString()}`,
    "WARNING: This temporary credential is shown once. Store and deliver it securely.",
    "The Administrator must change the credential at first login.",
    "",
  ].join("\n");
}

async function askRequiredQuestion(
  prompt: ReturnType<typeof createInterface>,
  question: string,
): Promise<string> {
  return new Promise<string>((resolveQuestion, rejectQuestion) => {
    const handleClose = () => {
      rejectQuestion(new BootstrapCliInputError());
    };

    prompt.once("close", handleClose);
    prompt.question(question).then(
      (answer) => {
        prompt.off("close", handleClose);
        resolveQuestion(answer);
      },
      (error: unknown) => {
        prompt.off("close", handleClose);
        rejectQuestion(error);
      },
    );
  });
}

export async function collectBootstrapMetadata(
  input: Readable,
  output: Writable,
) {
  const prompt = createInterface({ input, output });

  try {
    return {
      organisationName: await askRequiredQuestion(
        prompt,
        "Organisation name: ",
      ),
      administratorName: await askRequiredQuestion(
        prompt,
        "Administrator name: ",
      ),
      administratorEmail: await askRequiredQuestion(
        prompt,
        "Administrator email: ",
      ),
      professionalTitle: await askRequiredQuestion(
        prompt,
        "Professional title: ",
      ),
    };
  } finally {
    prompt.close();
  }
}

export async function runBootstrapAdminCli(): Promise<void> {
  const metadata = await collectBootstrapMetadata(
    process.stdin,
    process.stdout,
  );
  const result = await bootstrapInitialAdministrator(metadata);
  process.stdout.write(formatBootstrapSuccess(result));
}

export function getBootstrapCliErrorMessage(error: unknown): string {
  if (error instanceof BootstrapCliInputError) {
    return BOOTSTRAP_CLI_ERROR_MESSAGES.INCOMPLETE_METADATA;
  }

  if (error instanceof ZodError) {
    return BOOTSTRAP_CLI_ERROR_MESSAGES.INVALID_METADATA;
  }

  if (
    error instanceof InitialAdministratorBootstrapError &&
    error.code === "INSTALLATION_NOT_EMPTY"
  ) {
    return BOOTSTRAP_CLI_ERROR_MESSAGES.INSTALLATION_NOT_EMPTY;
  }

  return BOOTSTRAP_CLI_ERROR_MESSAGES.UNEXPECTED;
}

export function writeBootstrapCliError(error: unknown, output: Writable): void {
  output.write(`${getBootstrapCliErrorMessage(error)}\n`);
}

const entryPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

async function runBootstrapAdminMain(): Promise<void> {
  let failureReported = false;

  try {
    await runBootstrapAdminCli();
  } catch (error: unknown) {
    writeBootstrapCliError(error, process.stderr);
    failureReported = true;
    process.exitCode = 1;
  } finally {
    try {
      await prisma.$disconnect();
    } catch (error: unknown) {
      if (!failureReported) {
        writeBootstrapCliError(error, process.stderr);
      }

      process.exitCode = 1;
    }
  }
}

if (entryPath === import.meta.url) {
  void runBootstrapAdminMain();
}
