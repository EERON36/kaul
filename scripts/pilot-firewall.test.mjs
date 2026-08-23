import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const operatorUrl = new URL(
  "../deploy/pilot/firewall/kaul-pilot-firewall",
  import.meta.url,
);
const rehearsalUrl = new URL("./pilot-firewall-rehearsal.sh", import.meta.url);
const systemdRehearsalUrl = new URL(
  "./pilot-firewall-systemd-rehearsal.sh",
  import.meta.url,
);
const gateCPolicyValidatorUrl = new URL(
  "./pilot-gate-c-policy.pl",
  import.meta.url,
);
const operator = readFileSync(operatorUrl, "utf8");
const rehearsal = readFileSync(rehearsalUrl, "utf8");
const dropIn = readFileSync(
  new URL(
    "../deploy/pilot/firewall/20-kaul-pilot-firewall.conf",
    import.meta.url,
  ),
  "utf8",
);
const rollbackService = readFileSync(
  new URL(
    "../deploy/pilot/firewall/kaul-pilot-firewall-rollback.service",
    import.meta.url,
  ),
  "utf8",
);
const rollbackTimer = readFileSync(
  new URL(
    "../deploy/pilot/firewall/kaul-pilot-firewall-rollback.timer",
    import.meta.url,
  ),
  "utf8",
);
const workflow = readFileSync(
  new URL("../.github/workflows/validate.yml", import.meta.url),
  "utf8",
);
const pilotOperator = readFileSync(
  new URL("./pilot-ops.sh", import.meta.url),
  "utf8",
);
const gateCPolicyValidator = readFileSync(gateCPolicyValidatorUrl, "utf8");
const pilotCompose = readFileSync(
  new URL("../compose.pilot.yaml", import.meta.url),
  "utf8",
);

function bashPath() {
  const candidates =
    process.platform === "win32"
      ? ["C:\\Program Files\\Git\\bin\\bash.exe"]
      : ["/bin/bash", "/usr/bin/bash"];
  return candidates.find((candidate) => existsSync(candidate));
}

function perlPath() {
  const candidates =
    process.platform === "win32"
      ? ["C:\\Program Files\\Git\\usr\\bin\\perl.exe"]
      : ["/usr/bin/perl", "/bin/perl"];
  return candidates.find((candidate) => existsSync(candidate));
}

function checkGateCPolicy(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "kaul-gate-c-policy-"));
  const policyPath = join(directory, "pilot-firewall.conf");
  const values = {
    COMPOSE_PROJECT_NAME: "kaul-pilot",
    PILOT_ENV_FILE: "/etc/kaul/pilot.env",
    INGRESS_INTERFACE: "ens18",
    HOST_IPV4_CIDR: "192.168.1.120/24",
    TRUSTED_NPM_IPV4: "192.168.1.100",
    PUBLISHED_TCP_PORT: "8080",
    ...overrides.policy,
  };
  writeFileSync(
    policyPath,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    { mode: 0o644 },
  );
  chmodSync(policyPath, 0o644);

  try {
    const perl = perlPath();
    expect(perl).toBeDefined();
    return spawnSync(
      perl,
      [
        fileURLToPath(gateCPolicyValidatorUrl),
        "--expected-owner-current",
        policyPath,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          KAUL_GATE_C_INGRESS_MODE: "npm",
          KAUL_GATE_C_PROJECT: "kaul-pilot",
          KAUL_GATE_C_ENV_FILE: "/etc/kaul/pilot.env",
          KAUL_GATE_C_BIND: "192.168.1.120:8080",
          KAUL_GATE_C_PROXY: "192.168.1.100",
          ...overrides.environment,
        },
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("Pilot Docker firewall contract", () => {
  it.each([operatorUrl, rehearsalUrl, systemdRehearsalUrl])(
    "has valid Bash syntax: %s",
    (url) => {
      const bash = bashPath();
      expect(bash).toBeDefined();
      const result = spawnSync(bash, ["-n", fileURLToPath(url)], {
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
    },
  );

  it("parses root configuration as strict data", () => {
    expect(operator).toContain("O_RDONLY | O_NOFOLLOW");
    expect(operator).toContain("O_RDONLY | O_NOFOLLOW | O_NONBLOCK");
    expect(operator).toContain("configuration mode must be exactly 0644");
    expect(operator).toContain("Duplicate firewall configuration key");
    expect(operator).toContain("Unknown firewall configuration key");
    expect(operator).toContain("forbidden control character");
    expect(operator).toContain("does not match the root firewall policy");
    expect(operator).toContain("PILOT_ENV_FILE");
    expect(operator).not.toMatch(/(^|\n)\s*(source|eval)\s/);
    expect(operator).not.toContain(". $CONFIG_FILE");
    expect(pilotOperator).toContain("validate_gate_c_policy_if_installed");
    expect(
      pilotOperator.match(/validate_gate_c_policy_if_installed/g),
    ).toHaveLength(3);
    expect(gateCPolicyValidator).toContain(
      "Installed Gate C policy requires PILOT_INGRESS_MODE=npm.",
    );
  });

  it("accepts a Gate C policy that exactly matches NPM Pilot ingress", () => {
    const result = checkGateCPolicy();
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ["public ingress", { environment: { KAUL_GATE_C_INGRESS_MODE: "public" } }],
    ["project", { environment: { KAUL_GATE_C_PROJECT: "other-project" } }],
    ["environment file", { policy: { PILOT_ENV_FILE: "/tmp/pilot.env" } }],
    ["private bind", { policy: { PUBLISHED_TCP_PORT: "8081" } }],
    ["trusted proxy", { policy: { TRUSTED_NPM_IPV4: "192.168.1.101" } }],
    ["public host address", { policy: { HOST_IPV4_CIDR: "203.0.113.120/24" } }],
    ["unsafe prefix", { policy: { HOST_IPV4_CIDR: "192.168.1.120/0" } }],
  ])("rejects a Gate C policy with mismatched %s", (_name, overrides) => {
    const result = checkGateCPolicy(overrides);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/ERROR:/);
  });

  it.skipIf(process.platform === "win32")(
    "rejects a FIFO Gate C policy without blocking",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "kaul-gate-c-fifo-"));
      const policyPath = join(directory, "pilot-firewall.conf");
      try {
        const fifo = spawnSync("mkfifo", ["-m", "0644", policyPath], {
          encoding: "utf8",
        });
        expect(fifo.status, fifo.stderr).toBe(0);
        const result = spawnSync(
          perlPath(),
          [
            fileURLToPath(gateCPolicyValidatorUrl),
            "--expected-owner-current",
            policyPath,
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              KAUL_GATE_C_INGRESS_MODE: "npm",
              KAUL_GATE_C_PROJECT: "kaul-pilot",
              KAUL_GATE_C_ENV_FILE: "/etc/kaul/pilot.env",
              KAUL_GATE_C_BIND: "192.168.1.120:8080",
              KAUL_GATE_C_PROXY: "192.168.1.100",
            },
            timeout: 2_000,
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("regular");
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it("owns a narrow original-DNAT rule and preserves foreign state", () => {
    expect(operator).toContain('readonly OWNED_CHAIN="KAUL-PILOT-CADDY"');
    expect(operator).toContain("--ctdir ORIGINAL");
    expect(operator).toContain("--ctdir REPLY");
    expect(operator).toContain('--ctorigdst "$HOST_IPV4"');
    expect(operator).toContain('--ctorigdstport "$PUBLISHED_TCP_PORT"');
    expect(operator).toContain('-i "$INGRESS_INTERFACE"');
    expect(operator).toContain('-s "$TRUSTED_NPM_IPV4/32"');
    expect(operator).toContain('-d "$TRUSTED_NPM_IPV4/32"');
    expect(operator).toContain("-j REJECT --reject-with tcp-reset");
    expect(operator).not.toMatch(/ESTABLISHED|RELATED/);
    expect(operator).not.toContain("iptables -F DOCKER-USER");
    expect(operator).not.toContain("-D FORWARD -j DOCKER-USER");
    expect(operator).not.toContain("-I FORWARD 1 -j DOCKER-USER");
    expect(operator).not.toContain("iptables-persistent");
    expect(pilotCompose).not.toMatch(/^\s*network_mode:/m);
    expect(pilotCompose).not.toMatch(/^\s*driver_opts:/m);
    expect(operator).toContain("duplicate or foreign references");
    expect(operator).toContain("duplicate or foreign DOCKER-USER transfers");
    expect(operator).toContain("IPv6 raw-table state could not be inspected");
    expect(operator).toContain('$(field_number + 1) == "CT"');
    expect(operator).toContain("--notrack");
    expect(operator).toContain("allow-direct-routing");
    expect(operator).toContain("JSON::PP::is_bool");
    expect(operator).toContain("default-network-opts");
    expect(operator).toContain("trusted_host_interfaces");
    expect(operator).toContain("gateway_mode_$family");
    expect(operator).toContain("IPv4 target DNAT state does not exactly match");
    expect(operator).toContain("count_target_dnat_rules");
    expect(operator).toContain("--dports");
    expect(operator).toContain(
      "Running Docker containers could not be enumerated",
    );
    expect(operator).toContain(
      "Raw-table NOTRACK rules require separate review",
    );
  });

  it("fails closed around Docker startup and rollback", () => {
    expect(dropIn).toContain("Restart=no");
    expect(dropIn).toMatch(/ExecStartPre=.* preflight /);
    expect(dropIn).toMatch(/ExecStartPre=.* apply /);
    expect(dropIn).toMatch(/ExecStartPost=.* verify /);
    expect(dropIn).toMatch(/ExecStopPost=.* fail-closed /);
    expect(dropIn).not.toMatch(/^-/m);
    expect(operator).toContain("docker-proxy");
    expect(operator).toContain("target_dnat_is_absent");
    expect(operator).toContain("validate_recovery_iptables_frontend");
    expect(operator).toContain("systemctl stop docker.socket docker.service");
    expect(rollbackService).not.toContain("--disable-ufw");
    expect(operator).not.toContain("ufw --force disable");
    expect(rollbackTimer).toContain("OnActiveSec=10min");
    expect(rollbackTimer).not.toContain("Persistent=true");
    expect(operator.indexOf('if [ "$COMMAND" = rollback ]')).toBeLessThan(
      operator.indexOf(
        "validate_pilot_environment_alignment\nvalidate_iptables_frontend",
      ),
    );
  });

  it("runs the exact-version rehearsal as an independent Linux job", () => {
    expect(workflow).toContain("firewall-rehearsal:");
    expect(workflow).toMatch(
      /firewall-rehearsal:[\s\S]*runs-on: ubuntu-latest/,
    );
    expect(workflow).toContain("bash scripts/pilot-firewall-rehearsal.sh");
    expect(workflow).toContain(
      "sudo bash scripts/pilot-firewall-systemd-rehearsal.sh",
    );
    expect(rehearsal).toContain(
      "docker@sha256:ab772b0eaf0b01e5843f6574e50ccdfc34a7bdcb82bbf2decafde54a0ee884a9",
    );
    expect(rehearsal).toContain(
      "alpine@sha256:7c8cb692ae09657cbc4a3f3cbd0e8d5a2690ba38386aaaf252dbb060bf5eb2e6",
    );
    expect(rehearsal).toContain('Server.Version}}\')" = "29.7.2"');
    expect(rehearsal).toContain("install -d -m 0755 /etc/docker");
    expect(rehearsal).toContain("foreign-sentinel");
    expect(rehearsal).toContain('docker volume rm "$DIND_VOLUME"');
    expect(rehearsal).toContain("forged forwarded headers");
    expect(rehearsal).toContain("Executable-looking configuration input");
    expect(rehearsal).toContain("A symlinked root configuration was accepted");
    expect(rehearsal).toContain("A FIFO root configuration blocked preflight");
    expect(rehearsal).toContain("A FIFO Pilot environment blocked preflight");
    expect(rehearsal).toContain(
      "A conditional FORWARD transfer to DOCKER-USER was accepted",
    );
    expect(rehearsal).toContain("A raw-table CT --notrack bypass was accepted");
    expect(rehearsal).toContain("A string-valued Docker boolean was accepted");
    expect(rehearsal).toContain(
      "Docker default direct-routing network options were accepted",
    );
    expect(rehearsal).toContain(
      "A foreign goto reference to the Kaul-owned chain was accepted",
    );
    expect(rehearsal).toContain("A routed Pilot Docker network was accepted");
    expect(rehearsal).toContain("A foreign target DNAT rule was accepted");
    expect(rehearsal).toContain("A broader-CIDR target DNAT rule was accepted");
    expect(rehearsal).toContain(
      "A multiport range target DNAT rule was accepted",
    );
    expect(rehearsal).toContain("unauthorized established connection");
    expect(rehearsal).toContain(
      "Docker restart recreated its first FORWARD jump before the denied restart-policy workload became reachable.",
    );
    expect(rehearsal).toContain("trap cleanup EXIT");
    expect(rehearsal).toContain(
      "Disposable firewall containers and network cleanup verified.",
    );
  });
});
