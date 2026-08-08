import {
  changeForcedPasswordInternal,
  ForcedPasswordChangeError,
  type ForcedPasswordChangeResult,
} from "./password-change-internal";
export { ForcedPasswordChangeError, type ForcedPasswordChangeResult };

export function changeForcedPassword(
  input: unknown,
): Promise<ForcedPasswordChangeResult> {
  return changeForcedPasswordInternal(input);
}
