import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const rehearsal = readFileSync(
  new URL("./pilot-ingress-rehearsal.sh", import.meta.url),
  "utf8",
);
const workflow = readFileSync(
  new URL("../.github/workflows/validate.yml", import.meta.url),
  "utf8",
);
const rehearsalPath = fileURLToPath(
  new URL("./pilot-ingress-rehearsal.sh", import.meta.url),
);

function bashPath() {
  const candidates =
    process.platform === "win32"
      ? ["C:\\Program Files\\Git\\bin\\bash.exe"]
      : ["/bin/bash", "/usr/bin/bash"];
  return candidates.find((candidate) => existsSync(candidate));
}

describe("Pilot ingress rehearsal contract", () => {
  it("runs as an independent disposable Linux CI job", () => {
    expect(workflow).toContain("ingress-rehearsal:");
    expect(workflow).toMatch(/ingress-rehearsal:[\s\S]*runs-on: ubuntu-latest/);
    expect(workflow).toContain("bash scripts/pilot-ingress-rehearsal.sh");
    expect(rehearsal).toContain("trap cleanup EXIT");
    expect(rehearsal).toContain("compose_npm down --volumes --remove-orphans");
    expect(rehearsal).toContain("compose_npm ps --all");
    expect(rehearsal).toContain(
      "compose_npm logs --no-color --tail 100 kaul caddy",
    );
  });

  it("has valid Bash syntax", () => {
    const bash = bashPath();
    expect(bash).toBeDefined();
    const result = spawnSync(bash, ["-n", rehearsalPath], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it("uses the production Compose and Caddy contracts in both ingress modes", () => {
    for (const requiredPath of [
      "compose.pilot.yaml",
      "compose.pilot.npm.yaml",
      "compose.pilot.public.yaml",
    ]) {
      expect(rehearsal).toContain(requiredPath);
    }
    expect(rehearsal).toContain(
      "validate --config /etc/caddy/Caddyfile --adapter caddyfile",
    );
    expect(rehearsal).toContain(
      "The base Compose file must pin Caddy by digest.",
    );
    expect(rehearsal.indexOf("compose_public run --rm --no-deps")).toBeLessThan(
      rehearsal.indexOf("compose_npm up -d --no-deps"),
    );
    expect(rehearsal).toContain("wait_for_stub");
    expect(rehearsal).toContain("wait_for_caddy_upstream");
    expect(rehearsal).toContain("wait_for_trusted_ingress");
    expect(rehearsal).toContain('cap_add: ["NET_BIND_SERVICE"]');
    expect(rehearsal.indexOf("wait_for_stub\n")).toBeLessThan(
      rehearsal.indexOf("compose_npm up -d --no-deps caddy"),
    );
  });

  it("checks unpublished services and the NPM trust boundary", () => {
    expect(rehearsal).toContain('for unpublished in ("kaul", "postgres")');
    expect(rehearsal).toContain(
      "A non-NPM Docker peer reached the private Caddy listener.",
    );
    expect(rehearsal).toContain(
      "A direct host request reached the private Caddy listener.",
    );
    expect(rehearsal).toContain(
      "Caddy did not produce the expected sanitized upstream metadata.",
    );
    expect(rehearsal).toContain("PILOT_NPM_TRUSTED_PROXY_CIDR=$NPM_PEER_IP/32");
  });

  it("keeps its synthetic peer addresses explicitly rehearsal-only", () => {
    expect(rehearsal).toContain("NPM_PEER_IP=172.31.251.10");
    expect(rehearsal).toContain("PILOT_CADDY_PRIVATE_BIND=127.0.0.1:");
    expect(rehearsal).not.toContain("192.168.50.10/32");
    expect(rehearsal).not.toContain("10.0.0.0/8");
    expect(rehearsal).not.toContain("private_ranges");
  });
});
