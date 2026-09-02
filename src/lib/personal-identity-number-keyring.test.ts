import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadPersonalIdentityNumberKeyring,
  parsePersonalIdentityNumberKeyring,
  resetPersonalIdentityNumberKeyringCacheForTest,
} from "./personal-identity-number-keyring";

const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const temporaryDirectories: string[] = [];

afterEach(() => {
  resetPersonalIdentityNumberKeyringCacheForTest();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function serializedKeyring(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    formatVersion: 1,
    activeKeyId: "active",
    keys: [
      { id: "active", key },
      { id: "old", key: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE" },
    ],
    ...overrides,
  });
}

describe("Personnummer keyring", () => {
  it("loads an active encryption key and retained decryption keys", () => {
    const parsed = parsePersonalIdentityNumberKeyring(serializedKeyring());
    expect(parsed.activeKeyId).toBe("active");
    expect([...parsed.keys.keys()]).toEqual(["active", "old"]);
    expect(parsed.keys.get("active")?.symmetricKeySize).toBe(32);
  });

  it.each([
    ["malformed JSON", "{"],
    ["unsupported format", serializedKeyring({ formatVersion: 2 })],
    ["missing active key", serializedKeyring({ activeKeyId: "missing" })],
    [
      "duplicate identifiers",
      serializedKeyring({
        keys: [
          { id: "active", key },
          { id: "active", key },
        ],
      }),
    ],
    ["unknown fields", serializedKeyring({ unexpected: "not allowed" })],
    [
      "short decoded key",
      serializedKeyring({ keys: [{ id: "active", key: "AAAA" }] }),
    ],
    [
      "padded base64",
      serializedKeyring({ keys: [{ id: "active", key: `${key}=` }] }),
    ],
  ])("rejects %s without echoing key material", (_label, value) => {
    expect(() => parsePersonalIdentityNumberKeyring(value)).toThrow(
      "Invalid Personnummer keyring.",
    );
    try {
      parsePersonalIdentityNumberKeyring(value);
    } catch (error) {
      expect(String(error)).not.toContain(key);
    }
  });

  it("loads a file once and fails generically when unavailable", () => {
    const directory = mkdtempSync(join(tmpdir(), "kaul-keyring-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "keyring.json");
    writeFileSync(path, serializedKeyring(), { mode: 0o600 });

    const first = loadPersonalIdentityNumberKeyring(path);
    writeFileSync(path, "invalid", { mode: 0o600 });
    expect(loadPersonalIdentityNumberKeyring(path)).toBe(first);
    expect(() =>
      loadPersonalIdentityNumberKeyring(join(directory, "missing.json")),
    ).toThrow("Personnummer keyring is unavailable.");
  });

  it.runIf(process.platform !== "win32")(
    "fails generically when the keyring file is unreadable",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "kaul-keyring-"));
      temporaryDirectories.push(directory);
      const path = join(directory, "keyring.json");
      writeFileSync(path, serializedKeyring(), { mode: 0o600 });
      chmodSync(path, 0o000);

      expect(() => loadPersonalIdentityNumberKeyring(path)).toThrow(
        "Personnummer keyring is unavailable.",
      );
    },
  );
});
