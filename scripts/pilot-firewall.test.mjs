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
const liveFixtureUrl = new URL(
  "./pilot-firewall-live-fixture.sh",
  import.meta.url,
);
const gateCPolicyValidatorUrl = new URL(
  "./pilot-gate-c-policy.pl",
  import.meta.url,
);
const operator = readFileSync(operatorUrl, "utf8");
const rehearsal = readFileSync(rehearsalUrl, "utf8");
const systemdRehearsal = readFileSync(systemdRehearsalUrl, "utf8");
const liveFixture = readFileSync(liveFixtureUrl, "utf8");
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
const firewallRunbook = readFileSync(
  new URL("../deploy/pilot/firewall/README.md", import.meta.url),
  "utf8",
);
const firewallConfigExample = readFileSync(
  new URL(
    "../deploy/pilot/firewall/pilot-firewall.conf.example",
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

function expectInOrder(text, markers) {
  let previousIndex = -1;
  for (const marker of markers) {
    const markerIndex = text.indexOf(marker, previousIndex + 1);
    expect(markerIndex).toBeGreaterThan(previousIndex);
    previousIndex = markerIndex;
  }
}

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
    INGRESS_INTERFACE: "ens18",
    HOST_IPV4_CIDR: "192.168.1.120/24",
    TRUSTED_NPM_IPV4: "192.168.1.100",
    PUBLISHED_TCP_PORT: "8080",
    ...overrides.policy,
  };
  for (const key of overrides.omit ?? []) delete values[key];
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
  it.each([operatorUrl, rehearsalUrl, systemdRehearsalUrl, liveFixtureUrl])(
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
    expect(operator).not.toContain("PILOT_ENV_FILE");
    expect(operator).not.toContain("validate_pilot_environment_alignment");
    expect(firewallConfigExample).not.toContain("PILOT_ENV_FILE");
    expect(firewallConfigExample.match(/^[A-Z][A-Z0-9_]*=/gm)).toEqual([
      "COMPOSE_PROJECT_NAME=",
      "INGRESS_INTERFACE=",
      "HOST_IPV4_CIDR=",
      "TRUSTED_NPM_IPV4=",
      "PUBLISHED_TCP_PORT=",
    ]);
    expect(operator).not.toMatch(/(^|\n)\s*(source|eval)\s/);
    expect(operator).not.toContain(". $CONFIG_FILE");
    expect(pilotOperator).toContain("validate_gate_c_policy_if_installed");
    expect(pilotOperator).not.toContain("KAUL_GATE_C_ENV_FILE");
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
    ["missing required key", { omit: ["TRUSTED_NPM_IPV4"] }],
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
    expect(operator).toContain(
      '"-A $OWNED_CHAIN -s $TRUSTED_NPM_IPV4/32 -i $INGRESS_INTERFACE -m conntrack --ctdir ORIGINAL -j RETURN"',
    );
    expect(operator).toContain(
      '"-A $OWNED_CHAIN -d $TRUSTED_NPM_IPV4/32 -o $INGRESS_INTERFACE -m conntrack --ctdir REPLY -j RETURN"',
    );
    expect(
      operator.match(/-p tcp -m tcp -j REJECT --reject-with tcp-reset/g),
    ).toHaveLength(2);
    expect(operator).not.toMatch(/ESTABLISHED|RELATED/);
    expect(operator).not.toContain("iptables -F DOCKER-USER");
    expect(operator).toContain(
      "iptables -w 10 -t filter -D FORWARD -j DOCKER-USER",
    );
    expect(operator).toContain(
      "iptables -w 10 -t filter -I FORWARD 1 -j DOCKER-USER",
    );
    expect(operator).not.toContain("iptables-persistent");
    expect(pilotCompose).not.toMatch(/^\s*network_mode:/m);
    expect(pilotCompose).not.toMatch(/^\s*driver_opts:/m);
    expect(operator).toContain("duplicate or foreign references");
    expect(operator).toContain("duplicate or foreign DOCKER-USER transfers");
    expect(operator).toContain(
      "The managed FORWARD to DOCKER-USER integration remains after removal",
    );
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
    expect(operator.match(/\|\| return 0/g)).toHaveLength(2);
    expect(operator).not.toMatch(/\|\| return\r?\n/);
    expect(operator).toContain(
      "Raw-table NOTRACK rules require separate review",
    );
  });

  it("fails closed around Docker startup and rollback", () => {
    expect(dropIn).toContain("Requires=ufw.service");
    expect(dropIn).toContain("After=network-online.target ufw.service");
    expect(dropIn).toContain("Restart=no");
    expect(dropIn).toMatch(/ExecStartPre=.* preflight /);
    expect(dropIn).toMatch(/ExecStartPre=.* apply /);
    expect(dropIn).toMatch(/ExecStartPost=.* verify /);
    expect(dropIn).toMatch(/ExecStopPost=.* fail-closed /);
    expect(dropIn).not.toMatch(/^-/m);
    expect(operator).toContain("docker-proxy");
    expect(operator).toContain("target_dnat_is_absent");
    expect(operator).toContain("validate_recovery_iptables_frontend");
    expect(operator).toContain("systemctl --no-block stop docker.socket");
    expect(operator).toContain("docker.socket stop job was accepted");
    expect(operator).toContain("SOCKET_STOP_OUTCOME=accepted");
    expect(operator).not.toContain(
      "systemctl stop docker.socket docker.service",
    );
    expectInOrder(operator, [
      "remove|rollback)",
      "systemctl stop docker.socket ||",
      "require_unit_stopped docker.socket",
      "systemctl stop docker.service ||",
      "require_unit_stopped docker.service",
      "require_unit_stopped docker.socket",
    ]);
    expect(dropIn).not.toContain("TimeoutStopSec");
    expect(rollbackService).not.toContain("--disable-ufw");
    expect(operator).not.toContain("ufw --force disable");
    expect(operator).toContain("validate_ufw_policy");
    expect(operator).toContain("systemctl is-active ufw.service");
    expect(operator).toContain("ufw status verbose");
    expect(operator).toContain("ufw show added");
    expect(operator).toContain("MANAGEMENT_IPV4_CIDR");
    expect(operator.match(/validate_ufw_policy/g)).toHaveLength(3);
    expect(firewallRunbook).toContain("sudo nft --handle list ruleset");
    expect(firewallRunbook).toContain("sudo ufw show added");
    expect(firewallRunbook).toContain("sudo ufw status numbered");
    expect(firewallRunbook).toContain("LastTriggerUSecMonotonic");
    expect(firewallRunbook).toContain("ExecMainStartTimestampMonotonic");
    expect(firewallRunbook).toContain(
      'ssh_context="addr=$operator_ip,host=$client_host,laddr=$vm_ip,lport=$vm_port"',
    );
    expect(firewallRunbook).toContain(
      'sshd -T -C "user=$operator_user,$ssh_context"',
    );
    expect(
      firewallRunbook.indexOf(
        "sudo systemctl stop docker.socket docker.service",
      ),
    ).toBeLessThan(
      firewallRunbook.indexOf(
        "deploy/pilot/firewall/20-kaul-pilot-firewall.conf",
      ),
    );
    expect(
      firewallRunbook.indexOf(
        "deploy/pilot/firewall/20-kaul-pilot-firewall.conf",
      ),
    ).toBeLessThan(
      firewallRunbook.indexOf(
        "sudo systemctl start kaul-pilot-firewall-rollback.timer",
      ),
    );
    expect(
      firewallRunbook.indexOf(
        "sudo systemctl start kaul-pilot-firewall-rollback.timer",
      ),
    ).toBeLessThan(
      firewallRunbook.indexOf(
        "sudo /usr/local/libexec/kaul-pilot-firewall apply",
      ),
    );
    expect(rollbackTimer).toContain("OnActiveSec=10min");
    expect(rollbackTimer).not.toContain("Persistent=true");
    expect(operator.indexOf('if [ "$COMMAND" = rollback ]')).toBeLessThan(
      operator.indexOf("validate_iptables_frontend\nvalidate_no_raw_notrack"),
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
    expect(systemdRehearsal).toContain(
      "Service started while its UFW dependency failed",
    );
    expect(systemdRehearsal).toContain(
      "Disposable bootstrap service did not become active",
    );
    expect(systemdRehearsal).toContain(
      "Disposable bootstrap service did not create its simulated publication",
    );
    expect(systemdRehearsal).toContain(
      'systemctl is-active --quiet "$SERVICE"',
    );
    expect(systemdRehearsal).toContain(
      "Bootstrap stop left a simulated publication",
    );
    expectInOrder(systemdRehearsal, [
      'systemctl start "$SERVICE"',
      "for _attempt in $(seq 1 30); do",
      'systemctl is-active --quiet "$SERVICE" || {',
      '[ -e "$WORK_DIRECTORY/exposure" ] || {',
      'systemctl stop "$SERVICE"',
    ]);
    expect(systemdRehearsal).toContain("Requires=$FIREWALL_SERVICE");
    expect(systemdRehearsal).toContain("Requires=$SOCKET");
    expect(systemdRehearsal).toContain("After=$SOCKET");
    expect(systemdRehearsal).toContain("OnActiveSec=30s");
    expect(systemdRehearsal).toContain('systemctl --no-block stop "$SOCKET"');
    expect(systemdRehearsal).toContain(
      'timeout 10 systemctl start "$ROLLBACK_SERVICE"',
    );
    expect(systemdRehearsal).toContain(
      "Repeated explicit rollback was not idempotent",
    );
    expect(systemdRehearsal).toContain(
      "Timed fallback did not independently complete rollback",
    );
    expect(systemdRehearsal).toContain(
      "A disposable rollback helper process remained",
    );
    expect(systemdRehearsal).toContain(
      "A unit-specific systemctl process remained after rollback",
    );
    expect(systemdRehearsal).toContain(
      "Process state could not be inspected while checking",
    );
    expect(systemdRehearsal).not.toContain(
      'systemctl reset-failed "$SERVICE" "$ROLLBACK_SERVICE"',
    );
    expectInOrder(systemdRehearsal, [
      "start_protected_service() {",
      'prepare_units_for_reuse "$SERVICE" "$expected_service_state"',
      '"$SOCKET" inactive',
      'systemctl start "$SOCKET"',
      'systemctl start "$SERVICE"',
      "release_load_anchor",
    ]);
    expect(systemdRehearsal).not.toContain(
      'systemctl reset-failed "$SERVICE" || true',
    );
    expect(systemdRehearsal).toContain('[ "$process_status" -eq 1 ]');
    expect(systemdRehearsal).not.toContain('! pgrep -f -- "$HELPER_PATH"');
    expect(systemdRehearsal).toContain(
      "Disposable rollback jobs could not be inspected",
    );
    expect(systemdRehearsal).toContain(
      "Disposable service/socket jobs could not be inspected",
    );
    expect(systemdRehearsal).toContain('[ -z "$rollback_jobs" ]');
    expect(systemdRehearsal).toContain('[ -z "$unit_jobs" ]');
    expect(systemdRehearsal).toContain(
      "$'preflight\\napply\\nverify-failed\\nfail-closed-accepted'",
    );
    expect(systemdRehearsal).toContain(
      "$'preflight\\napply\\nverify-failed\\nfail-closed-stopped'",
    );
    expect(systemdRehearsal).not.toContain(
      "grep -Eq '^fail-closed-(accepted|stopped)$'",
    );
    expectInOrder(systemdRehearsal, [
      'systemctl stop "$SOCKET"',
      'systemctl stop "$SERVICE"',
      'case "\\$service_state" in inactive|failed)',
      '[ "\\$socket_state" = inactive ]',
    ]);
    expectInOrder(systemdRehearsal, [
      "# Reload the garbage-collected rollback units",
      'prepare_units_for_reuse "$ROLLBACK_SERVICE" inactive',
      '"$ROLLBACK_TIMER" inactive',
      'systemctl start "$ROLLBACK_TIMER"',
      "assert_fresh_timer_history",
      "cancel_rollback_timer_race_safely",
      "release_load_anchor",
      'wait_for_units_unloaded "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER"',
      "# Re-arm again and prove the timer independently dispatches",
      'prepare_units_for_reuse "$ROLLBACK_SERVICE" inactive',
      '"$ROLLBACK_TIMER" inactive',
      'systemctl start "$ROLLBACK_TIMER"',
      "assert_fresh_timer_history",
    ]);
    expect(systemdRehearsal).toContain(
      '[ "$rollback_started" -lt "$active_since" ]',
    );
    expect(rehearsal).toContain(
      "docker@sha256:ab772b0eaf0b01e5843f6574e50ccdfc34a7bdcb82bbf2decafde54a0ee884a9",
    );
    expect(rehearsal).toContain(
      "alpine@sha256:7c8cb692ae09657cbc4a3f3cbd0e8d5a2690ba38386aaaf252dbb060bf5eb2e6",
    );
    expect(rehearsal).toContain('DIND_RUNTIME_IMAGE="$PEER_IMAGE"');
    expect(rehearsal).toContain('"iptables=1.8.11-r1"');
    expect(rehearsal).toContain('--entrypoint tar "$DIND_IMAGE"');
    expect(rehearsal).toContain('--name "$DIND_SOURCE_NAME"');
    expect(rehearsal).toContain(
      'docker exec -i "$DIND_NAME" tar -C /usr/local/bin -xf -',
    );
    expect(rehearsal).toContain('Server.Version}}\')" = "29.7.2"');
    expect(rehearsal).toContain(
      "stop:docker.socket|stop:docker.service) exit 0 ;;",
    );
    expect(rehearsal).toContain("install -d -m 0755 /etc/docker");
    expect(rehearsal).toContain("grep -v '^#'");
    expect(rehearsal).toContain("foreign-sentinel");
    expect(rehearsal).toContain('docker volume rm "$DIND_VOLUME"');
    expect(rehearsal).toContain("forged forwarded headers");
    expect(rehearsal).toContain("nc -ll -p 18080 -e cat");
    expect(rehearsal).toContain("Executable-looking configuration input");
    expect(rehearsal).toContain("A symlinked root configuration was accepted");
    expect(rehearsal).toContain("A FIFO root configuration blocked preflight");
    expect(rehearsal).toContain(
      "A Gate C configuration with a missing required key was accepted.",
    );
    expect(rehearsal).toContain("assert_no_pilot_environment");
    expect(rehearsal).not.toContain('"PILOT_ENV_FILE=/etc/kaul/pilot.env"');
    expect(rehearsal).toContain(
      "A conditional FORWARD transfer to DOCKER-USER was accepted",
    );
    expect(rehearsal).toContain("A raw-table CT --notrack bypass was accepted");
    expect(rehearsal).toContain("An inactive UFW service was accepted");
    expect(rehearsal).toContain(
      "An active service with disabled UFW policy was accepted",
    );
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
      "The canonical FORWARD transfer was absent before the Docker restart probe.",
    );
    expect(rehearsal).toContain(
      "A FORWARD transfer to DOCKER-USER remained after removal.",
    );
    expectInOrder(rehearsal, [
      "rm -f /tmp/restart-window /tmp/restart-probe-ready /tmp/stop-restart-probe",
      "test -e /tmp/restart-probe-ready",
      "stop_inner_docker",
      "run_operator apply",
      "start_inner_docker",
      "run_verify",
      "probe_allowed",
      "probe_denied",
      "touch /tmp/stop-restart-probe",
      "test ! -e /tmp/restart-window",
    ]);
    expect(rehearsal).toContain(
      "The continuous unauthorized probe never connected during Docker stop, firewall reconciliation, startup, and verified restart-policy workload restoration.",
    );
    expect(rehearsal).toContain(
      "The continuous unauthorized restart probe exited before completing.",
    );
    expect(rehearsal).toContain("trap cleanup EXIT");
    expect(rehearsal).toContain(
      "Disposable firewall containers and network cleanup verified.",
    );
  });

  it("pins failed units through strict reset before garbage collection and reload", () => {
    expectInOrder(systemdRehearsal, [
      "pin_units_for_reuse() {",
      "systemctl daemon-reload",
      'systemctl start "$LOAD_ANCHOR"',
      '[ "$anchor_state" = active ]',
      'systemctl show --property=LoadState --value "$unit"',
      '[ "$unit_load_state" = loaded ]',
    ]);
    expectInOrder(systemdRehearsal, [
      "prepare_units_for_reuse() {",
      'pin_units_for_reuse "${units[@]}"',
      'systemctl show --property=ActiveState --value "$unit"',
      "failed:failed|inactive:inactive|inactive-or-failed:failed|inactive-or-failed:inactive)",
      '[ "$unit_active_state" != failed ] || failed_units+=("$unit")',
      'systemctl reset-failed "${failed_units[@]}"',
      "Post-reset state could not be inspected",
      '[ "$unit_active_state" = inactive ]',
      "release_load_anchor",
      'wait_for_units_unloaded "${units[@]}"',
      'pin_units_for_reuse "${units[@]}"',
      "Reloaded state could not be inspected",
      '[ "$unit_active_state" = inactive ]',
    ]);
    expect(systemdRehearsal).not.toContain(
      'systemctl reset-failed "${failed_units[@]}" || true',
    );
    expectInOrder(systemdRehearsal, [
      "Failed UFW dependency allowed a simulated publication",
      'systemctl stop "$SOCKET"',
      'systemctl is-active "$SOCKET"',
      "Dependency-failure socket did not become inactive",
      'prepare_units_for_reuse "$SERVICE" inactive-or-failed',
      '"$FIREWALL_SERVICE" failed',
      '"$SOCKET" inactive',
      "wait_for_stopped_units failed",
      "$'preflight\\napply\\nverify-failed\\nfail-closed-accepted'",
      "start_protected_service failed",
    ]);
    expect(systemdRehearsal).toContain(
      'prepare_units_for_reuse "$SERVICE" "$expected_service_state"',
    );
    expect(systemdRehearsal).toContain('"$SOCKET" inactive');
    expect(systemdRehearsal).toContain(
      "Disposable rollback service failed during timer cancellation",
    );
    expectInOrder(systemdRehearsal, [
      "stop_rollback_timer_strictly() {",
      'systemctl stop "$ROLLBACK_TIMER"',
      'timer_state=$(systemctl is-active "$ROLLBACK_TIMER"',
      '[ "$timer_state" = inactive ]',
    ]);
    expectInOrder(systemdRehearsal, [
      '[ "$(grep -c \'^rollback$\' "$WORK_DIRECTORY/events")" -eq 3 ]',
      "Timed fallback did not independently complete rollback",
      "stop_rollback_timer_strictly",
      "release_load_anchor",
      'wait_for_units_unloaded "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER"',
    ]);
    expect(systemdRehearsal.split("stop_rollback_timer_strictly")).toHaveLength(
      4,
    );
  });

  it("reloads every garbage-collected systemd unit through one lifecycle pattern", () => {
    const rollbackReuse =
      'prepare_units_for_reuse "$ROLLBACK_SERVICE" inactive';
    const rollbackUnload =
      'wait_for_units_unloaded "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER"';

    expect(systemdRehearsal).toContain(
      'readonly LOAD_ANCHOR="${UNIT}-load-anchor.target"',
    );
    expect(systemdRehearsal).toContain(
      "Description=Disposable unit load anchor for lifecycle rehearsal",
    );
    expect(systemdRehearsal).toContain(
      "After=$SERVICE $SOCKET $FIREWALL_SERVICE $ROLLBACK_SERVICE $ROLLBACK_TIMER",
    );
    expect(systemdRehearsal).toContain(
      'prepare_units_for_reuse "$SERVICE" inactive-or-failed',
    );
    expect(systemdRehearsal).toContain(
      'wait_for_units_unloaded "$ROLLBACK_SERVICE" "$SERVICE" "$SOCKET"',
    );
    expect(systemdRehearsal.split(rollbackReuse)).toHaveLength(5);
    expect(systemdRehearsal.split(rollbackUnload)).toHaveLength(4);
    expect(
      systemdRehearsal.split('systemctl start "$ROLLBACK_SERVICE"'),
    ).toHaveLength(3);
    expect(
      systemdRehearsal.split('systemctl start "$ROLLBACK_TIMER"'),
    ).toHaveLength(3);
    expect(
      systemdRehearsal.indexOf(
        'systemctl reset-failed "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER"',
      ),
    ).toBeLessThan(systemdRehearsal.indexOf("trap cleanup EXIT"));
    expect(
      systemdRehearsal.match(
        /systemctl reset-failed "\$ROLLBACK_SERVICE" "\$ROLLBACK_TIMER"/g,
      ),
    ).toHaveLength(1);
    expect(systemdRehearsal).not.toContain(
      'systemctl stop "$ROLLBACK_TIMER"\nprepare_units_for_reuse',
    );
    expect(systemdRehearsal).toContain(
      '"$ROLLBACK_PATH" "$TIMER_PATH" "$LOAD_ANCHOR_PATH"',
    );
    expect(systemdRehearsal).toContain(
      'systemctl cat "$LOAD_ANCHOR" >/dev/null 2>&1',
    );
    expect(systemdRehearsal).toContain(
      'systemctl reset-failed "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER" "$SOCKET"',
    );
    expect(systemdRehearsal).toContain(
      '"$SERVICE" "$FIREWALL_SERVICE" "$LOAD_ANCHOR"',
    );
  });

  it("uses the lifecycle-safe systemd model in the real-host runbook", () => {
    const initialArm = firewallRunbook.slice(
      firewallRunbook.indexOf("Only after Docker is stopped"),
      firewallRunbook.indexOf("Before cancellation"),
    );
    const rearm = firewallRunbook.slice(
      firewallRunbook.indexOf("If the rollback service has historical"),
      firewallRunbook.indexOf("Before Pilot deployment"),
    );
    const explicitRollback = firewallRunbook.slice(
      firewallRunbook.indexOf("## Explicit rollback"),
    );

    expectInOrder(initialArm, [
      "sudo systemctl daemon-reload",
      "for unit in kaul-pilot-firewall-rollback.service",
      '--property=LoadState --value "$unit"',
      '[ "$load_state" = loaded ]',
      "--property=ActiveState --value",
      '[ "$active_state" = inactive ]',
      "sudo systemctl start kaul-pilot-firewall-rollback.timer",
    ]);
    expectInOrder(rearm, [
      "reset_failed_rollback_unit_if_needed() {",
      'case "$active_state" in',
      'failed) sudo systemctl reset-failed "$unit"',
      "inactive) ;;",
      '[ "$active_state" = inactive ]',
      "sudo systemctl daemon-reload",
      "for unit in kaul-pilot-firewall-rollback.service",
      "kaul-pilot-firewall-rollback.timer; do",
      "--property=LoadState --value",
      '[ "$load_state" = loaded ]',
      "rollback_jobs=$(sudo systemctl list-jobs",
      'reset_failed_rollback_unit_if_needed "$unit"',
      "sudo systemctl start kaul-pilot-firewall-rollback.timer",
    ]);
    expectInOrder(explicitRollback, [
      "sudo systemctl daemon-reload",
      "for unit in kaul-pilot-firewall-rollback.service",
      "kaul-pilot-firewall-rollback.timer; do",
      "--property=LoadState --value",
      '[ "$load_state" = loaded ]',
      "reset_failed_rollback_unit_if_needed \\",
      "sudo systemctl start kaul-pilot-firewall-rollback.service",
      "sudo systemctl daemon-reload",
      "for unit in kaul-pilot-firewall-rollback.service",
      "kaul-pilot-firewall-rollback.timer; do",
      "--property=LoadState --value",
      '[ "$load_state" = loaded ]',
      "timer_state=$(sudo systemctl show --property=ActiveState --value",
      'case "$timer_state" in',
      "active)",
      "sudo systemctl stop kaul-pilot-firewall-rollback.timer",
      "--property=ActiveState --value \\\n    kaul-pilot-firewall-rollback.service",
    ]);
    expect(
      firewallRunbook.match(/reset_failed_rollback_unit_if_needed\(\) \{/g),
    ).toHaveLength(2);
    expect(firewallRunbook).not.toContain(
      "systemctl reset-failed kaul-pilot-firewall-rollback.service \\\n    kaul-pilot-firewall-rollback.timer",
    );
    expect(firewallRunbook).not.toContain(
      'sudo systemctl reset-failed "$unit" || true',
    );
  });

  it("provides a bounded Gate C-only live validation workload", () => {
    expect(liveFixture).toContain("umask 077");
    expect(liveFixture).toContain(
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    );
    expect(liveFixture).toContain("export PATH");
    expect(liveFixture).toContain(
      "alpine@sha256:7c8cb692ae09657cbc4a3f3cbd0e8d5a2690ba38386aaaf252dbb060bf5eb2e6",
    );
    expect(liveFixture).toContain('case "$COMMAND" in start|status|stop)');
    expect(liveFixture).toContain("readonly FIXTURE_LIFETIME_SECONDS=480");
    expect(liveFixture).toContain(
      "restricted to COMPOSE_PROJECT_NAME=kaul-pilot",
    );
    expect(liveFixture).toContain(
      "restricted to the reviewed 192.168.1.120:8080 binding",
    );
    expect(liveFixture).toContain("OnActiveSec=10min");
    expect(liveFixture).toContain(
      'systemctl show --property=SubState --value "$ROLLBACK_TIMER"',
    );
    expect(liveFixture).toContain('[ "$timer_substate" = waiting ]');
    expect(liveFixture).toContain('[ "$last_trigger" = 0 ]');
    expect(liveFixture).toContain(
      '[ "$rollback_started" -lt "$active_since" ]',
    );
    expect(liveFixture).toContain(
      'systemctl show --property=Unit --value "$ROLLBACK_TIMER"',
    );
    expect(liveFixture).toContain('[ "$timer_unit" = "$ROLLBACK_SERVICE" ]');
    expect(liveFixture).toContain(
      'systemctl show --property=RandomizedDelayUSec --value "$ROLLBACK_TIMER"',
    );
    expect(liveFixture).toContain('[ "$randomized_delay" = 0 ]');
    expect(liveFixture).toContain('[ "$persistent" = no ]');
    expect(liveFixture).toContain('[ "$fixed_random_delay" = no ]');
    expect(liveFixture).toContain(
      'systemctl show --property=NextElapseUSecMonotonic --value "$ROLLBACK_TIMER"',
    );
    expect(liveFixture).toContain('systemd-analyze timespan "$1"');
    expect(liveFixture).toContain('$1 == "μs:"');
    expect(liveFixture).toContain(
      "expected_deadline=$((active_since + 600000000))",
    );
    expect(liveFixture).toContain('[ "$accuracy_usec" -eq 1000000 ]');
    expect(liveFixture).toContain(
      '--label "com.docker.compose.project=$COMPOSE_PROJECT_NAME"',
    );
    expect(liveFixture).toContain('--label "com.docker.compose.service=caddy"');
    expect(liveFixture).toContain(
      '--publish "$HOST_IPV4:$PUBLISHED_TCP_PORT:8080/tcp"',
    );
    expect(liveFixture).toContain("--rm");
    expect(liveFixture).toContain("--restart=no");
    expect(liveFixture).toContain("--read-only");
    expect(liveFixture).toContain("--user 65534:65534");
    expect(liveFixture).toContain("--cap-drop ALL");
    expect(liveFixture).toContain("--security-opt no-new-privileges:true");
    expect(liveFixture).toContain("--memory 32m");
    expect(liveFixture).toContain("--memory-swap 32m");
    expect(liveFixture).toContain("--cpus 0.25");
    expect(liveFixture).toContain("--pids-limit 16");
    expect(liveFixture).toContain("--network bridge");
    expect(liveFixture).not.toContain("--volume");
    expect(liveFixture).not.toMatch(/\n\s+-v(?:\s|\\)/);
    expect(liveFixture).not.toContain("--env-file");
    expect(liveFixture).not.toMatch(/\n\s+--env(?:\s|\\)/);
    expect(liveFixture).toContain("kaul-gate-c-live-validation");
    expect(liveFixture).toContain(
      "This temporary Gate C validation workload is never a Pilot deployment.",
    );
    expect(liveFixture).toContain(
      "This does not prove NPM-origin access or rejection from an unauthorized LAN host.",
    );
    expect(liveFixture).toContain(
      "container, listener, and target DNAT cleanup verified",
    );
    expect(liveFixture.match(/require_fixture_port_unpublished/g)).toHaveLength(
      3,
    );
    expect(liveFixture).toContain("tcp_listeners=$(ss -H -ltn)");
    expect(liveFixture).toContain("udp_listeners=$(ss -H -lun)");
    expect(liveFixture).toContain(
      "TCP or UDP $PUBLISHED_TCP_PORT is still listening after fixture cleanup",
    );
    expect(firewallRunbook).toContain(
      "scripts/pilot-firewall-live-fixture.sh start",
    );
    expect(firewallRunbook).toContain(
      "Rule inspection is not live unauthorised-path evidence",
    );
    expect(firewallRunbook).toContain(
      'failed) sudo systemctl reset-failed "$unit"',
    );
    expect(firewallRunbook).toContain("--property=SubState --value");
    expect(firewallRunbook).toContain(
      "so it cannot dispatch the same rollback redundantly",
    );
    expect(firewallRunbook).not.toContain(
      'test -z "$(sudo systemctl list-jobs',
    );
    expect(
      firewallRunbook.match(
        /rollback_jobs=\$\(sudo systemctl list-jobs[\s\S]*?\) \|\| exit 1\n  test -z "\$rollback_jobs"/g,
      ),
    ).toHaveLength(2);
    expect(firewallRunbook).toContain(
      '*:0) ;;\n    *) test "$rollback_started" -lt "$timer_started"',
    );
    expect(
      firewallRunbook.match(
        /\*:0\) ;;\n    \*\) test "\$rollback_started" -lt "\$timer_started"/g,
      ),
    ).toHaveLength(2);
  });
});
