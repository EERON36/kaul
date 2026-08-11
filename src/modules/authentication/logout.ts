import "server-only";

import {
  logoutCurrentSessionInternal,
  type LogoutResult,
} from "./logout-internal";

export function logoutCurrentSession(headers: Headers): Promise<LogoutResult> {
  return logoutCurrentSessionInternal(headers);
}
