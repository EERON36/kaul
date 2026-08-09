import type { ForcedPasswordChangeInput } from "./password-change-input";
import { randomUUID } from "node:crypto";
import {
  changeForcedPasswordInternal,
  type ForcedPasswordChangeResult,
  type PasswordChangeTestDependencies,
} from "./password-change-internal";

export function changeForcedPasswordForTest(
  input: ForcedPasswordChangeInput & { operationId?: string },
  dependencies: PasswordChangeTestDependencies,
): Promise<ForcedPasswordChangeResult> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Password-change test support requires NODE_ENV=test.");
  }

  return changeForcedPasswordInternal(
    { operationId: input.operationId ?? randomUUID(), ...input },
    dependencies,
  );
}
