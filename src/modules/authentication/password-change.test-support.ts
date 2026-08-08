import type { ForcedPasswordChangeInput } from "./password-change-input";
import {
  changeForcedPasswordInternal,
  type ForcedPasswordChangeResult,
  type PasswordChangeTestDependencies,
} from "./password-change-internal";

export function changeForcedPasswordForTest(
  input: ForcedPasswordChangeInput,
  dependencies: PasswordChangeTestDependencies,
): Promise<ForcedPasswordChangeResult> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Password-change test support requires NODE_ENV=test.");
  }

  return changeForcedPasswordInternal(input, dependencies);
}
