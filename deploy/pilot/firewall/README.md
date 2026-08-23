# Kaul Pilot Docker firewall operator

This directory contains the reviewed Gate C host-firewall contract. It does not
configure a host by itself. A human operator installs and runs it only after a
separate deployment approval.

The Homelab model has three independent layers:

1. UFW protects host `INPUT` services such as SSH.
2. `DOCKER-USER` protects Docker's DNAT/FORWARD path to private Caddy.
3. Caddy accepts the direct peer only from the same exact NPM `/32` and applies
   the strict trusted-proxy policy.

UFW alone does not control Docker-published forwarding reliably. Proxmox
firewall activation is not required for this Pilot design.

## Exact owned rule model

The operator owns only `KAUL-PILOT-CADDY` and one commented first jump from
`DOCKER-USER`. It never creates, deletes, or reorders Docker's
`FORWARD -> DOCKER-USER` integration. Docker 29.7.2 must install that canonical
first jump during daemon initialization, before it restores restart-policy
containers; the unprefixed post-start check fails Docker unless that happened.
The exact-version rehearsal is the required evidence for that ordering. A
separate disposable systemd rehearsal proves that an intentional post-start
failure invokes the stop-post guard, stops socket activation, removes the
simulated publication, and retains protection. The
operator never flushes `DOCKER-USER` or saves Docker's dynamic ruleset.
If post-start verification fails, systemd stops the Docker service and runs an
`ExecStopPost` proof that the daemon, proxies, listener, and matching IPv4/IPv6
DNAT are absent while the Kaul guard remains installed.

```text
-A FORWARD -j DOCKER-USER
-A DOCKER-USER -p tcp -m conntrack \
  --ctorigdst 192.168.1.120 --ctorigdstport 8080 \
  -m comment --comment kaul-pilot-private-caddy -j KAUL-PILOT-CADDY
-A KAUL-PILOT-CADDY -s 192.168.1.100/32 -i ens18 \
  -m conntrack --ctdir ORIGINAL -j RETURN
-A KAUL-PILOT-CADDY -d 192.168.1.100/32 -o ens18 \
  -m conntrack --ctdir REPLY -j RETURN
-A KAUL-PILOT-CADDY -p tcp -m tcp -j REJECT --reject-with tcp-reset
```

Docker has already applied DNAT before `DOCKER-USER`, so the jump matches the
original host address and port with conntrack in both directions. Directional
`RETURN` rules send only the expected NPM request/reply path back to Docker's
normal policy; they are not broad accepts. The final rejection also cuts off an
unauthorised connection that existed before policy repair.
There is deliberately no broad `ESTABLISHED,RELATED` exception.

Source filtering is not cryptographic peer authentication. A LAN attacker that
can successfully spoof NPM's address is outside this control. Caddy remains an
independent exact-direct-peer check. The real `192.168.1.100` peer remains
provisional until a bounded Caddy request observes it directly.

## Installed files

Install the repository artifacts as:

```text
/usr/local/libexec/kaul-pilot-firewall                         root:root 0755
/etc/kaul/pilot-firewall.conf                                 root:root 0644
/etc/systemd/system/docker.service.d/20-kaul-pilot-firewall.conf
/etc/systemd/system/kaul-pilot-firewall-rollback.service
/etc/systemd/system/kaul-pilot-firewall-rollback.timer
```

The operator parses the configuration as strict, non-secret data with a fixed
key set. Mode `0644` lets the non-root `pilot-ops.sh` compare every Compose
preflight's project, canonical environment path, private bind, and trusted NPM
peer with the root-owned policy, while only root can change it. The privileged
helper remains authoritative for interface, prefix, same-network,
private-address, backend, and runtime firewall validation. The
operator rejects symlinks, non-root ownership, loose modes, duplicate or unknown keys,
non-canonical addresses, unexpected interfaces, Docker native-nftables,
unexpected Docker/iptables versions, live restore, direct-routing/gateway
modes, global IPv6, unsafe Docker publications, raw-table `NOTRACK` or
`CT --notrack`, duplicate owned references, and foreign jump/goto rules in its
chain.

The root policy points to the existing operator-owned `pilot.env` and refuses
preflight, apply, or verify unless its project name, `npm` ingress mode, private
bind, and trusted proxy `/32` exactly match. Create and validate
`/etc/kaul/pilot.env` before this Gate C installation. Changing ingress mode or
either peer/bind value is a reviewed stop-and-reapply operation, never a live
Compose-only change. Recovery deliberately does not depend on `pilot.env`:
`remove` and timed rollback can still stop Docker and remove exact Kaul-owned
state if the operator environment has drifted or disappeared.

## Later manual installation gate

Run these commands from the reviewed repository checkout only after a separate
approval. Keep the current SSH session open and have Proxmox console access
available.

```sh
sudo install -d -o root -g root -m 0755 /usr/local/libexec
sudo install -o root -g root -m 0755 \
  deploy/pilot/firewall/kaul-pilot-firewall \
  /usr/local/libexec/kaul-pilot-firewall

sudo install -d -o root -g root -m 0755 /etc/kaul
sudo install -o root -g root -m 0644 \
  deploy/pilot/firewall/pilot-firewall.conf.example \
  /etc/kaul/pilot-firewall.conf
sudoedit /etc/kaul/pilot-firewall.conf

sudo install -d -o root -g root -m 0755 \
  /etc/systemd/system/docker.service.d
sudo install -o root -g root -m 0644 \
  deploy/pilot/firewall/20-kaul-pilot-firewall.conf \
  /etc/systemd/system/docker.service.d/20-kaul-pilot-firewall.conf
sudo install -o root -g root -m 0644 \
  deploy/pilot/firewall/kaul-pilot-firewall-rollback.service \
  /etc/systemd/system/kaul-pilot-firewall-rollback.service
sudo install -o root -g root -m 0644 \
  deploy/pilot/firewall/kaul-pilot-firewall-rollback.timer \
  /etc/systemd/system/kaul-pilot-firewall-rollback.timer

sudo systemctl daemon-reload
sudo systemd-analyze verify docker.service \
  kaul-pilot-firewall-rollback.service \
  kaul-pilot-firewall-rollback.timer
sudo systemctl cat docker.service
```

Stop if the effective Docker unit does not contain exactly the reviewed
preflight, apply, verify, and stop-post fail-closed hooks, or if
`systemd-analyze` reports an error.

## Lockout-safe application and UFW sequence

The timer is a narrow Docker fail-safe, not SSH recovery and not proof that
every host failure is recoverable. If it fires, it stops Docker and its socket,
proves no daemon, proxy, listener, or target DNAT remains, and removes only
Kaul-owned firewall state. If those Docker checks fail, it retains the guard.
It never disables or rewrites global UFW policy.

```sh
sudo systemctl start kaul-pilot-firewall-rollback.timer
sudo systemctl is-active kaul-pilot-firewall-rollback.timer
sudo systemctl show -p ActiveEnterTimestampMonotonic \
  -p NextElapseUSecMonotonic kaul-pilot-firewall-rollback.timer

sudo systemctl stop docker.socket docker.service
sudo /usr/local/libexec/kaul-pilot-firewall preflight \
  --config /etc/kaul/pilot-firewall.conf
sudo /usr/local/libexec/kaul-pilot-firewall apply \
  --config /etc/kaul/pilot-firewall.conf

grep '^IPV6=yes$' /etc/default/ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on ens18 from 192.168.1.0/24 to any port 22 proto tcp
sudo ufw --force enable
sudo ufw status verbose

sudo systemctl start docker.service
sudo systemctl --no-pager --full status docker.service
sudo /usr/local/libexec/kaul-pilot-firewall verify \
  --config /etc/kaul/pilot-firewall.conf
```

Allowing SSH from `192.168.1.0/24` lets any device on the private management LAN
attempt key-based authentication, but avoids locking the operator to one DHCP
workstation. Keep password, keyboard-interactive, and root login disabled;
tighten the source later when a reserved management address or VPN exists. The
timer does not recover a bad UFW rule: keep the current SSH session open, prove
a second session, and use the Proxmox console to run `sudo ufw disable` if SSH
is lost.

Before cancellation, open a second SSH session from `192.168.1.0/24`, run the
peer tests below, and confirm Proxmox console access. Then cancel and verify the
timer race-safely:

```sh
(
  set -eu
  sudo systemctl stop kaul-pilot-firewall-rollback.timer
  test "$(sudo systemctl is-active kaul-pilot-firewall-rollback.timer)" = inactive
  for attempt in $(seq 1 30); do
    rollback_state=$(sudo systemctl show --property=ActiveState --value \
      kaul-pilot-firewall-rollback.service) || exit 1
    rollback_jobs=$(sudo systemctl list-jobs --no-legend --no-pager \
      kaul-pilot-firewall-rollback.service) || exit 1
    case "$rollback_state" in
      inactive|failed) [ -z "$rollback_jobs" ] && break ;;
    esac
    sleep 1
  done
  rollback_state=$(sudo systemctl show --property=ActiveState --value \
    kaul-pilot-firewall-rollback.service) || exit 1
  rollback_jobs=$(sudo systemctl list-jobs --no-legend --no-pager \
    kaul-pilot-firewall-rollback.service) || exit 1
  case "$rollback_state" in
    inactive|failed) ;;
    *) printf '%s\n' "Rollback service state is still $rollback_state." >&2; exit 1 ;;
  esac
  [ -z "$rollback_jobs" ] || {
    printf '%s\n' "A rollback service job is still queued or running." >&2
    exit 1
  }
  sudo /usr/local/libexec/kaul-pilot-firewall verify \
    --config /etc/kaul/pilot-firewall.conf
)
```

Stopping the timer prevents a new dispatch; waiting for any already-dispatched
service closes the cancellation race. Only the final successful firewall
verification completes cancellation. If the rollback service already ran, do
not restart Docker. Review its status and the firewall from the console first.

## Verification

From the NPM LXC, a bounded request should connect and Caddy should record the
direct peer as `192.168.1.100`:

```sh
curl --fail-with-body --max-time 5 \
  -H 'Host: pilot.REPLACE.example' \
  http://192.168.1.120:8080/api/health
```

From an ordinary LAN PC, both the normal and forged-header requests must fail
to connect:

```sh
curl --verbose --max-time 5 http://192.168.1.120:8080/api/health
curl --verbose --max-time 5 \
  -H 'X-Forwarded-For: 192.168.1.100' \
  -H 'X-Real-IP: 192.168.1.100' \
  http://192.168.1.120:8080/api/health
```

On the Kaul VM:

```sh
sudo /usr/local/libexec/kaul-pilot-firewall verify \
  --config /etc/kaul/pilot-firewall.conf
sudo iptables -w 10 -t filter -S FORWARD
sudo iptables -w 10 -t filter -S DOCKER-USER
sudo iptables -w 10 -t filter -S KAUL-PILOT-CADDY
sudo iptables -w 10 -t filter -L DOCKER-USER -n -v --line-numbers
sudo ss -H -ltnp
docker ps --format 'table {{.Names}}\t{{.Ports}}'
curl --verbose --max-time 5 http://192.168.1.120:8080/api/health
```

The VM-local request is checked by Caddy's direct-peer rejection, not by the
forwarded-packet `DOCKER-USER` path. No listener may appear on `0.0.0.0:8080`,
`[::]:8080`, port 3000, or port 5432.

After a Docker restart, repeat all three perspectives. At the later reboot gate,
reboot the VM and repeat them before declaring persistence proven. The CI
systemd rehearsal proves bounded unit failure semantics only; it does not prove
the real host's unit installation, Docker boot, or reboot timing.

## Explicit rollback

To trigger the same guarded rollback immediately:

```sh
sudo systemctl start kaul-pilot-firewall-rollback.service
sudo systemctl --no-pager --full status \
  kaul-pilot-firewall-rollback.service
sudo systemctl is-active docker.service docker.socket
sudo iptables -w 10 -t filter -S DOCKER-USER
sudo ufw status verbose
```

Docker remains stopped and UFW remains unchanged. Do not restart Docker until
the failure is understood and the preflight/apply/verify sequence passes. For
planned uninstallation, stop Docker and its socket, run the operator's `remove`,
then remove only the five installed files above and run
`systemctl daemon-reload`.
