import {
  bootstrapInitialAdministratorInternal,
  generateTemporaryCredentialInternal,
  initialAdministratorInputSchema,
  type InitialAdministratorBootstrapResult,
  type InitialAdministratorInput,
  type InitialAdministratorTestDependencies,
} from "./initial-administrator-internal";

const TEST_SUPPORT_ERROR_MESSAGE =
  "Initial Administrator test support is available only in tests.";

function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(TEST_SUPPORT_ERROR_MESSAGE);
  }
}

export function parseInitialAdministratorInputForTest(input: unknown) {
  assertTestEnvironment();
  return initialAdministratorInputSchema.parse(input);
}

export function generateTemporaryCredentialForTest(): string {
  assertTestEnvironment();
  return generateTemporaryCredentialInternal();
}

export function bootstrapInitialAdministratorForTest(
  input: InitialAdministratorInput,
  dependencies: InitialAdministratorTestDependencies = {},
): Promise<InitialAdministratorBootstrapResult> {
  assertTestEnvironment();
  return bootstrapInitialAdministratorInternal(input, dependencies);
}
