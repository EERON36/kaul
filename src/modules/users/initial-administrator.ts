import {
  bootstrapInitialAdministratorInternal,
  recoverInitialAdministratorBootstrapInternal,
  InitialAdministratorBootstrapError,
  type InitialAdministratorBootstrapResult,
  type InitialAdministratorInput,
} from "./initial-administrator-internal";

export {
  InitialAdministratorBootstrapError,
  type InitialAdministratorBootstrapResult,
  type InitialAdministratorInput,
};

export function bootstrapInitialAdministrator(
  input: InitialAdministratorInput,
): Promise<InitialAdministratorBootstrapResult> {
  return bootstrapInitialAdministratorInternal(input);
}

export function recoverInitialAdministratorBootstrap(
  operationId: string,
): Promise<void> {
  return recoverInitialAdministratorBootstrapInternal(operationId);
}
