#!/usr/bin/env bash

set -Eeuo pipefail

readonly DIND_IMAGE="docker@sha256:ab772b0eaf0b01e5843f6574e50ccdfc34a7bdcb82bbf2decafde54a0ee884a9"
readonly PEER_IMAGE="alpine@sha256:7c8cb692ae09657cbc4a3f3cbd0e8d5a2690ba38386aaaf252dbb060bf5eb2e6"
readonly DIND_RUNTIME_IMAGE="$PEER_IMAGE"
readonly NETWORK_NAME="kaul-firewall-rehearsal-${GITHUB_RUN_ID:-local}-$$"
readonly DIND_NAME="${NETWORK_NAME}-dind"
readonly DIND_SOURCE_NAME="${NETWORK_NAME}-docker-source"
readonly DIND_VOLUME="${NETWORK_NAME}-data"
readonly DIRECT_NETWORK_NAME="${NETWORK_NAME}-direct"
readonly NPM_NAME="${NETWORK_NAME}-npm"
readonly LAN_NAME="${NETWORK_NAME}-lan"
readonly HOST_IP="192.168.1.120"
readonly NPM_IP="192.168.1.100"
readonly LAN_IP="192.168.1.101"
readonly OWNED_CHAIN="KAUL-PILOT-CADDY"
readonly OWNED_COMMENT="kaul-pilot-private-caddy"
readonly UFW_INPUT_CHAIN="KAUL-REHEARSAL-UFW"
readonly UFW_INPUT_COMMENT="kaul-rehearsal-ufw-input"
readonly DIRECT_PROXY_SOURCE_PORT="48080"
readonly DIRECT_PROXY_TUPLE_COMMENT="kaul-rehearsal-direct-proxy-tuple"
readonly DIRECT_PROXY_SETUP_COMMENT="kaul-rehearsal-pre-dnat-setup"

ROOT_DIRECTORY=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local original_status=$?
  local cleanup_failed=false
  trap - EXIT
  set +e
  docker exec "$DIND_NAME" docker network rm "$DIRECT_NETWORK_NAME" >/dev/null 2>&1
  if docker exec "$DIND_NAME" docker network inspect "$DIRECT_NETWORK_NAME" >/dev/null 2>&1; then
    cleanup_failed=true
  fi
  docker rm --force --volumes \
    "$NPM_NAME" "$LAN_NAME" "$DIND_SOURCE_NAME" "$DIND_NAME" >/dev/null 2>&1
  docker network rm "$NETWORK_NAME" >/dev/null 2>&1
  docker volume rm "$DIND_VOLUME" >/dev/null 2>&1
  local resource
  for resource in "$NPM_NAME" "$LAN_NAME" "$DIND_SOURCE_NAME" "$DIND_NAME"; do
    if docker inspect "$resource" >/dev/null 2>&1; then
      cleanup_failed=true
    fi
  done
  if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    cleanup_failed=true
  fi
  if docker volume inspect "$DIND_VOLUME" >/dev/null 2>&1; then
    cleanup_failed=true
  fi
  if [ "$cleanup_failed" = true ]; then
    printf '%s\n' "ERROR: Disposable firewall rehearsal cleanup could not be verified." >&2
  else
    printf '%s\n' "Disposable firewall containers and network cleanup verified."
  fi
  if [ "$original_status" -eq 0 ] && [ "$cleanup_failed" = true ]; then
    exit 2
  fi
  exit "$original_status"
}
trap cleanup EXIT

inner() {
  docker exec "$DIND_NAME" "$@"
}

wait_for_inner_docker() {
  local attempt
  for attempt in $(seq 1 60); do
    if inner docker info >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  inner sh -c 'tail -200 /tmp/dockerd.log' >&2 || true
  die "Docker 29.7.2 did not become ready."
}

wait_for_inner_docker_stop() {
  local attempt
  for attempt in $(seq 1 60); do
    if ! inner pgrep -x dockerd >/dev/null 2>&1 &&
      ! inner pgrep -x docker-proxy >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  die "Nested Docker processes did not stop."
}

start_inner_docker() {
  docker exec --detach "$DIND_NAME" sh -c \
    '/usr/local/bin/dockerd --host=unix:///var/run/docker.sock --firewall-backend=iptables > /tmp/dockerd.log 2>&1'
  wait_for_inner_docker
  [ "$(inner docker version --format '{{.Server.Version}}')" = "29.7.2" ] ||
    die "The pinned rehearsal image did not run Docker Engine 29.7.2."
  [ "$(inner docker info --format '{{.FirewallBackend.Driver}}')" = "iptables" ] ||
    die "The rehearsal Docker backend is not iptables."
}

stop_inner_docker() {
  inner pkill -TERM dockerd
  wait_for_inner_docker_stop
}

run_operator() {
  inner /usr/local/libexec/kaul-pilot-firewall "$@" \
    --config /etc/kaul/pilot-firewall.conf
}

assert_no_pilot_environment() {
  inner test ! -e /etc/kaul/pilot.env ||
    die "Gate C rehearsal unexpectedly created or required a Pilot environment file."
}

dump_owned_filter_state() {
  printf '%s\n' "Actual disposable $OWNED_CHAIN state:" >&2
  inner iptables -w 10 -t filter -S "$OWNED_CHAIN" >&2 || true
  printf '%s\n' "Actual disposable DOCKER-USER state:" >&2
  inner iptables -w 10 -t filter -S DOCKER-USER >&2 || true
}

set_restart_phase() {
  local phase=$1
  inner sh -c \
    "printf '%s phase=%s mode=modeled-docker-service-transition\\n' \"\$(date -u +'%Y-%m-%dT%H:%M:%S.%N')\" '$phase' >> /tmp/restart-phases.log; printf '%s\\n' '$phase' > /tmp/restart-phase"
  docker exec "$LAN_NAME" sh -c \
    "printf '%s\\n' '$phase' > /tmp/restart-phase"
}

start_restart_diagnostics() {
  inner rm -f /tmp/restart-conntrack.log /tmp/restart-conntrack.pid \
    /tmp/restart-packets.log /tmp/restart-packets.pid \
    /tmp/restart-first-success.log /tmp/restart-phases.log /tmp/restart-phase \
    /tmp/restart-xtables.log /tmp/restart-xtables.pid

  docker exec --detach "$DIND_NAME" sh -c \
    "printf '%s\\n' \$\$ > /tmp/restart-packets.pid; exec tcpdump -i eth0 -nn -tttt -U -l -s 0 -A 'tcp and host $LAN_IP and port 8080' > /tmp/restart-packets.log 2>&1"
  docker exec --detach "$DIND_NAME" sh -c \
    "printf '%s\\n' \$\$ > /tmp/restart-conntrack.pid; exec conntrack -E -o timestamp,extended > /tmp/restart-conntrack.log 2>&1"
  docker exec --detach "$DIND_NAME" sh -c \
    'printf "%s\n" $$ > /tmp/restart-xtables.pid; xtables-monitor --event 2>&1 | while IFS= read -r event; do printf "%s phase=%s %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%S.%N")" "$(cat /tmp/restart-phase 2>/dev/null)" "$event"; done > /tmp/restart-xtables.log'

  local diagnostic
  for diagnostic in restart-packets restart-conntrack restart-xtables; do
    inner sh -c "test -s /tmp/$diagnostic.pid && kill -0 \$(cat /tmp/$diagnostic.pid)" ||
      die "The $diagnostic diagnostic did not start."
  done
}

stop_restart_diagnostics() {
  inner sh -c '
    if test -s /tmp/restart-packets.pid; then
      kill -INT "$(cat /tmp/restart-packets.pid)" 2>/dev/null || :
    fi
    if test -s /tmp/restart-conntrack.pid; then
      kill -TERM "$(cat /tmp/restart-conntrack.pid)" 2>/dev/null || :
    fi
    pkill -TERM -x xtables-monitor 2>/dev/null || :
  '
  sleep 1
}

dump_restart_diagnostics() {
  printf '%s\n' 'Gate C restart phase log:' >&2
  inner cat /tmp/restart-phases.log >&2 || true
  printf '%s\n' 'Unauthorized probe attempt log:' >&2
  docker exec "$LAN_NAME" sh -c '
    printf "%s\n" "First uniquely echoed attempt:"
    cat /tmp/restart-first-success.log
    printf "%s\n" "Attempt outcome counts by phase:"
    awk "{ phase=\"\"; result=\"\"; for (field=1; field<=NF; field+=1) { if (\$field ~ /^phase=/) phase=\$field; if (\$field ~ /^result=/) result=\$field } counts[phase \" \" result]+=1 } END { for (key in counts) print counts[key], key }" /tmp/restart-attempts.log | sort
    printf "%s\n" "Attempts surrounding the first success:"
    grep -B 5 -A 5 -F "result=echoed-new-connection" /tmp/restart-attempts.log | head -30
  ' >&2 || true
  printf '%s\n' 'TCP/8080 packet trace surrounding echoed payload:' >&2
  inner sh -c \
    "grep -B 12 -A 5 -F 'kaul-restart-' /tmp/restart-packets.log | head -120" >&2 || true
  printf '%s\n' 'TCP/8080 conntrack state and events:' >&2
  inner conntrack -L -p tcp --orig-src "$LAN_IP" --orig-dst "$HOST_IP" \
    --dport 8080 -o extended >&2 || true
  inner sh -c \
    "success_port=\$(awk -v source='$LAN_IP.' -v destination='$HOST_IP.8080:' '\$3 == \"IP\" && index(\$4, source) == 1 && \$6 == destination && /Flags \\[P.\\]/ { count=split(\$4, fields, \".\"); print fields[count]; exit }' /tmp/restart-packets.log); printf 'successful_source_port=%s\\n' \"\$success_port\"; grep -F \"sport=\$success_port \" /tmp/restart-conntrack.log | tail -40" >&2 || true
  printf '%s\n' 'iptables mutation trace:' >&2
  inner sh -c \
    "grep -E -- '(-D|-I|-A).*FORWARD.*DOCKER-USER|$OWNED_CHAIN|dport 8080|ctorigdstport 8080' /tmp/restart-xtables.log | tail -120" >&2 || true
  printf '%s\n' 'Docker process, socket, workload, and publication state:' >&2
  inner sh -c '
    pgrep -a dockerd || :
    pgrep -a docker-proxy || :
    if test -S /var/run/docker.sock; then printf "%s\n" "docker.socket=present"; else printf "%s\n" "docker.socket=absent"; fi
    ss -H -ltnp "sport = :8080" || :
    if docker info >/dev/null 2>&1; then
      docker inspect --format "container={{.Name}} status={{.State.Status}} running={{.State.Running}} restart={{.HostConfig.RestartPolicy.Name}} ports={{json .NetworkSettings.Ports}}" caddy || :
    else
      printf "%s\n" "docker.service=not-ready"
    fi
  ' >&2 || true
  printf '%s\n' 'Relevant filter state with counters:' >&2
  inner iptables -w 10 -t filter -L INPUT -n -v -x --line-numbers >&2 || true
  inner iptables -w 10 -t filter -L FORWARD -n -v -x --line-numbers >&2 || true
  inner iptables -w 10 -t filter -L DOCKER-USER -n -v -x --line-numbers >&2 || true
  inner iptables -w 10 -t filter -L "$OWNED_CHAIN" -n -v -x --line-numbers >&2 || true
  inner iptables -w 10 -t filter -S INPUT >&2 || true
  inner iptables -w 10 -t filter -S FORWARD >&2 || true
  inner iptables -w 10 -t filter -S DOCKER-USER >&2 || true
  inner iptables -w 10 -t filter -S "$OWNED_CHAIN" >&2 || true
  printf '%s\n' 'TCP/8080 NAT publication state:' >&2
  inner sh -c \
    "iptables -w 10 -t nat -S | grep -E '8080|(^-P)|(^-N DOCKER)'" >&2 || true
  printf '%s\n' 'Relevant Docker startup/restoration log:' >&2
  inner sh -c \
    "grep -E 'Starting up|Restoring containers|sbJoin|Loading containers: done|Daemon has completed initialization|API listen' /tmp/dockerd.log" >&2 || true
}

run_verify() {
  local verify_output
  if ! verify_output=$(run_operator verify 2>&1); then
    printf '%s\n' "$verify_output" >&2
    dump_owned_filter_state
    printf '%s\n' "Actual disposable FORWARD state:" >&2
    inner iptables -w 10 -t filter -S FORWARD >&2 || true
    inner sh -c 'tail -100 /tmp/dockerd.log' >&2 || true
    die "A required firewall verification failed."
  fi
  printf '%s\n' "$verify_output"
}

saved_filter_state() {
  inner iptables-save -t filter | grep -v '^#'
}

insert_owned_jump() {
  inner iptables -w 10 -t filter -I DOCKER-USER 1 \
    -p tcp -m conntrack \
    --ctorigdst "$HOST_IP" --ctorigdstport 8080 \
    -m comment --comment "$OWNED_COMMENT" -j "$OWNED_CHAIN"
}

install_ufw_input_model() {
  inner iptables -w 10 -t filter -N "$UFW_INPUT_CHAIN"
  inner iptables -w 10 -t filter -A "$UFW_INPUT_CHAIN" \
    -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  inner iptables -w 10 -t filter -A "$UFW_INPUT_CHAIN" \
    -i eth0 -s 192.168.1.0/24 -d "$HOST_IP/32" \
    -p tcp --dport 22 -j RETURN
  inner iptables -w 10 -t filter -A "$UFW_INPUT_CHAIN" -i eth0 -j DROP
  inner iptables -w 10 -t filter -I INPUT 1 \
    -m comment --comment "$UFW_INPUT_COMMENT" -j "$UFW_INPUT_CHAIN"

  local actual expected
  actual=$(inner iptables -w 10 -t filter -S "$UFW_INPUT_CHAIN")
  expected=$(printf '%s\n' \
    "-N $UFW_INPUT_CHAIN" \
    "-A $UFW_INPUT_CHAIN -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN" \
    "-A $UFW_INPUT_CHAIN -s 192.168.1.0/24 -d $HOST_IP/32 -i eth0 -p tcp -m tcp --dport 22 -j RETURN" \
    "-A $UFW_INPUT_CHAIN -i eth0 -j DROP")
  [ "$actual" = "$expected" ] ||
    die "The disposable UFW INPUT model was not exact."
  inner iptables -w 10 -t filter -S INPUT | sed -n '2p' |
    grep -Fxq -- "-A INPUT -m comment --comment $UFW_INPUT_COMMENT -j $UFW_INPUT_CHAIN" ||
    die "The disposable UFW INPUT model was not first."
}

ufw_input_drop_count() {
  inner iptables -w 10 -t filter -L "$UFW_INPUT_CHAIN" -n -v -x |
    awk '$3 == "DROP" { print $1 }'
}

assert_docker_proxy_listener() {
  local proxy_processes listeners
  proxy_processes=$(inner pgrep -a -x docker-proxy) ||
    die "The Docker-published workload had no live docker-proxy process."
  printf '%s\n' "$proxy_processes" |
    grep -F -- "-host-ip $HOST_IP" |
    grep -F -- "-host-port 8080" |
    grep -Fq -- "-proto tcp" ||
    die "The live docker-proxy process did not own the expected TCP/8080 publication."

  listeners=$(inner ss -H -ltnp 'sport = :8080') ||
    die "The Docker-published TCP/8080 listener could not be inspected."
  printf '%s\n' "$listeners" | grep -F "$HOST_IP:8080" |
    grep -Fq 'docker-proxy' ||
    die "The expected docker-proxy TCP/8080 listener was not live."
}

publication_dnat_rule() {
  inner iptables -w 10 -t nat "$@" DOCKER -d "$HOST_IP/32" ! -i docker0 \
    -p tcp -m tcp --dport 8080 -j DNAT --to-destination "$protected_ip:8080"
}

direct_proxy_conntrack_entry() {
  inner conntrack -L -p tcp --orig-src "$LAN_IP" --orig-dst "$HOST_IP" \
    --sport "$DIRECT_PROXY_SOURCE_PORT" --dport 8080 -o extended 2>/dev/null
}

assert_direct_proxy_conntrack_entry() {
  local entry expected_original
  entry=$(direct_proxy_conntrack_entry) ||
    die "The fixed direct-proxy conntrack tuple could not be inspected."
  expected_original="src=$LAN_IP dst=$HOST_IP sport=$DIRECT_PROXY_SOURCE_PORT dport=8080"
  if [ "$(printf '%s\n' "$entry" | grep -Fc "$expected_original")" -ne 1 ]; then
    printf '%s\n' "Actual fixed direct-proxy conntrack state:" >&2
    printf '%s\n' "$entry" >&2
    die "The expected fixed host-local conntrack tuple was not unique."
  fi
  printf '%s\n' "$entry" | grep -Fq '[UNREPLIED]' ||
    die "The fixed host-local conntrack tuple was not NEW/UNREPLIED."
}

direct_proxy_tuple_count() {
  inner iptables -w 10 -t filter -L "$UFW_INPUT_CHAIN" -n -v -x |
    awk -v marker="$DIRECT_PROXY_TUPLE_COMMENT" \
      'index($0, "/* " marker " */") { print $1 }'
}

probe_allowed() {
  docker exec "$NPM_NAME" sh -c \
    "printf 'GET / HTTP/1.0\\r\\nX-Forwarded-For: 203.0.113.9\\r\\n\\r\\n' | nc -w 3 $HOST_IP 8080" |
    grep -Fq 'X-Forwarded-For: 203.0.113.9'
}

probe_denied() {
  if docker exec "$LAN_NAME" sh -c \
    "printf 'GET / HTTP/1.0\\r\\nX-Forwarded-For: $NPM_IP\\r\\n\\r\\n' | nc -w 3 $HOST_IP 8080" >/dev/null 2>&1; then
    die "An unauthorized peer bypassed the firewall with forged forwarded headers."
  fi
}

command -v docker >/dev/null 2>&1 || die "Docker is required."
docker info >/dev/null 2>&1 || die "The outer Docker daemon is unavailable."

docker network create --driver bridge --subnet 192.168.1.0/24 \
  --gateway 192.168.1.1 "$NETWORK_NAME" >/dev/null
docker volume create "$DIND_VOLUME" >/dev/null
docker run --detach --privileged --network "$NETWORK_NAME" --ip "$HOST_IP" \
  --name "$DIND_NAME" --volume "$ROOT_DIRECTORY:/source:ro" \
  --volume "$DIND_VOLUME:/var/lib/docker" \
  "$DIND_RUNTIME_IMAGE" sleep infinity >/dev/null

case $(inner cat /etc/alpine-release) in
  3.22.*) ;;
  *) die "The pinned firewall runtime is not Alpine 3.22." ;;
esac
inner apk add --no-cache bash ca-certificates conntrack-tools coreutils curl \
  iproute2 "iptables=1.8.11-r1" perl procps tcpdump >/dev/null
docker run --rm --name "$DIND_SOURCE_NAME" \
  --volume "$DIND_VOLUME:/var/lib/docker" \
  --entrypoint tar "$DIND_IMAGE" \
  -C /usr/local/bin -cf - \
  containerd containerd-shim-runc-v2 ctr docker docker-init docker-proxy dockerd runc |
  docker exec -i "$DIND_NAME" tar -C /usr/local/bin -xf -
inner install -d -m 0755 /usr/local/libexec
inner install -m 0755 /source/deploy/pilot/firewall/kaul-pilot-firewall \
  /usr/local/libexec/kaul-pilot-firewall
inner install -d -m 0700 /etc/kaul
inner install -d -m 0755 /etc/docker
inner sh -c 'umask 077; printf "%s\n" \
  "COMPOSE_PROJECT_NAME=kaul-pilot" \
  "INGRESS_INTERFACE=eth0" \
  "HOST_IPV4_CIDR=192.168.1.120/24" \
  "TRUSTED_NPM_IPV4=192.168.1.100" \
  "PUBLISHED_TCP_PORT=8080" > /etc/kaul/pilot-firewall.conf'
inner chmod 0644 /etc/kaul/pilot-firewall.conf
assert_no_pilot_environment
inner sh -c 'cat > /usr/local/bin/systemctl <<"EOF"
#!/bin/sh
case "$1:$2" in
  show:--property=ExecStart) printf "%s\n" "{ path=/usr/local/bin/dockerd ; argv[]=/usr/local/bin/dockerd ; }" ;;
  is-active:ufw.service)
    if [ -e /tmp/ufw-inactive ]; then printf "%s\n" inactive; exit 3; fi
    printf "%s\n" active
    ;;
  is-active:docker.socket|is-active:docker.service) printf "%s\n" inactive; exit 3 ;;
  stop:docker.socket|stop:docker.service) exit 0 ;;
  *) exit 1 ;;
esac
EOF
chmod 0755 /usr/local/bin/systemctl'

inner sh -c 'cat > /usr/local/bin/ufw <<"EOF"
#!/bin/sh
case "$1:$2" in
  status:verbose)
    if [ -e /tmp/ufw-disabled ]; then printf "%s\n" "Status: inactive"; exit 0; fi
    printf "%s\n" \
      "Status: active" \
      "Default: deny (incoming), allow (outgoing), disabled (routed)"
    ;;
  show:added)
    printf "%s\n" \
      "Added user rules (see '"'"'ufw status'"'"' for running firewall):" \
      "ufw allow in on eth0 from 192.168.1.0/24 to any port 22 proto tcp"
    ;;
  *) exit 1 ;;
esac
EOF
chmod 0755 /usr/local/bin/ufw'

inner touch /tmp/ufw-inactive
if run_operator preflight >/dev/null 2>&1; then
  die "An inactive UFW service was accepted by preflight."
fi
inner rm -f /tmp/ufw-inactive

inner touch /tmp/ufw-disabled
if run_operator preflight >/dev/null 2>&1; then
  die "An active service with disabled UFW policy was accepted by preflight."
fi
inner rm -f /tmp/ufw-disabled

inner cp /etc/kaul/pilot-firewall.conf /etc/kaul/bad-firewall.conf
inner sed -i 's/PUBLISHED_TCP_PORT=.*/PUBLISHED_TCP_PORT=$(touch \/tmp\/injected)/' \
  /etc/kaul/bad-firewall.conf
if inner /usr/local/libexec/kaul-pilot-firewall preflight \
  --config /etc/kaul/bad-firewall.conf >/dev/null 2>&1; then
  die "Executable-looking configuration input was accepted."
fi
inner test ! -e /tmp/injected
inner ln -s /etc/kaul/pilot-firewall.conf /etc/kaul/symlink-firewall.conf
if inner /usr/local/libexec/kaul-pilot-firewall preflight \
  --config /etc/kaul/symlink-firewall.conf >/dev/null 2>&1; then
  die "A symlinked root configuration was accepted."
fi
inner mkfifo -m 0644 /etc/kaul/fifo-firewall.conf
set +e
inner timeout 2 /usr/local/libexec/kaul-pilot-firewall preflight \
  --config /etc/kaul/fifo-firewall.conf >/dev/null 2>&1
fifo_status=$?
set -e
[ "$fifo_status" -ne 0 ] || die "A FIFO root configuration was accepted."
[ "$fifo_status" -ne 124 ] || die "A FIFO root configuration blocked preflight."
inner cp /etc/kaul/pilot-firewall.conf /etc/kaul/missing-firewall-key.conf
inner sed -i '/TRUSTED_NPM_IPV4=/d' /etc/kaul/missing-firewall-key.conf
if inner /usr/local/libexec/kaul-pilot-firewall preflight \
  --config /etc/kaul/missing-firewall-key.conf >/dev/null 2>&1; then
  die "A Gate C configuration with a missing required key was accepted."
fi
inner chmod 0666 /etc/kaul/pilot-firewall.conf
if run_operator preflight >/dev/null 2>&1; then
  die "A loosely permissioned root configuration was accepted."
fi
inner chmod 0644 /etc/kaul/pilot-firewall.conf

inner iptables -w 10 -t filter -N DOCKER-USER
inner iptables -w 10 -t filter -A DOCKER-USER \
  -m comment --comment foreign-sentinel -j RETURN
inner iptables -w 10 -t filter -A FORWARD \
  -s 198.51.100.1/32 -m comment --comment foreign-forward-sentinel -j RETURN
inner iptables -w 10 -t filter -I FORWARD 1 \
  -s 192.168.1.0/24 -j DOCKER-USER
if run_operator preflight >/dev/null 2>&1; then
  die "A conditional FORWARD transfer to DOCKER-USER was accepted."
fi
inner iptables -w 10 -t filter -D FORWARD \
  -s 192.168.1.0/24 -j DOCKER-USER
inner iptables -w 10 -t raw -A PREROUTING -p tcp --dport 8080 \
  -j CT --notrack
if run_operator preflight >/dev/null 2>&1; then
  die "A raw-table CT --notrack bypass was accepted."
fi
inner iptables -w 10 -t raw -D PREROUTING -p tcp --dport 8080 \
  -j CT --notrack
inner sh -c 'printf "%s\n" "{\"allow-direct-routing\":true}" > /etc/docker/daemon.json'
if run_operator preflight >/dev/null 2>&1; then
  die "Docker allow-direct-routing was accepted."
fi
inner sh -c 'printf "%s\n" "{\"live-restore\":\"true\"}" > /etc/docker/daemon.json'
if run_operator preflight >/dev/null 2>&1; then
  die "A string-valued Docker boolean was accepted."
fi
inner sh -c 'printf "%s\n" "{\"default-network-opts\":{\"bridge\":{\"com.docker.network.bridge.gateway_mode_ipv4\":\"routed\"}}}" > /etc/docker/daemon.json'
if run_operator preflight >/dev/null 2>&1; then
  die "Docker default direct-routing network options were accepted."
fi
inner rm /etc/docker/daemon.json

run_operator preflight
assert_no_pilot_environment
if ! apply_output=$(run_operator apply 2>&1); then
  printf '%s\n' "$apply_output" >&2
  dump_owned_filter_state
  exit 1
fi
printf '%s\n' "$apply_output"
assert_no_pilot_environment
if ! first_state=$(saved_filter_state); then
  die "The first applied filter state could not be captured."
fi
if ! second_apply=$(run_operator apply 2>&1); then
  printf '%s\n' "$second_apply" >&2
  dump_owned_filter_state
  die "The idempotent second firewall application failed."
fi
[ "$second_apply" = "Kaul firewall and forwarding state is already exact; no rules changed." ] ||
  die "The second application was not an explicit no-op."
if ! second_state=$(saved_filter_state); then
  die "The second applied filter state could not be captured."
fi
[ "$first_state" = "$second_state" ] ||
  die "The idempotent application changed the ruleset."
inner iptables -w 10 -t filter -S DOCKER-USER |
  sed -n '2p' | grep -Fq -- "--comment $OWNED_COMMENT -j $OWNED_CHAIN" ||
  die "The Kaul-owned DOCKER-USER jump was not exact and first."
inner iptables -w 10 -t filter -S DOCKER-USER |
  grep -Fq -- '--comment foreign-sentinel -j RETURN' ||
  die "The foreign DOCKER-USER sentinel was not preserved."
inner iptables -w 10 -t filter -S FORWARD |
  sed -n '2p' | grep -Fxq -- '-A FORWARD -j DOCKER-USER' ||
  die "The canonical FORWARD transfer was not installed before Docker startup."
inner iptables -w 10 -t filter -S FORWARD |
  grep -Fq -- '--comment foreign-forward-sentinel -j RETURN' ||
  die "The foreign FORWARD sentinel was not preserved."
inner iptables -w 10 -t filter -A DOCKER-USER -g "$OWNED_CHAIN" ||
  die "The foreign goto rehearsal rule could not be installed."
if run_operator apply >/dev/null 2>&1; then
  die "A foreign goto reference to the Kaul-owned chain was accepted."
fi
inner iptables -w 10 -t filter -D DOCKER-USER -g "$OWNED_CHAIN" ||
  die "The foreign goto rehearsal rule could not be removed."
printf '%s\n' "Pre-Docker idempotence and foreign-state checks passed."

start_inner_docker
run_verify
assert_no_pilot_environment
inner iptables -w 10 -t filter -S FORWARD | sed -n '2p' |
  grep -Fxq -- '-A FORWARD -j DOCKER-USER'
inner docker network create \
  --label com.docker.compose.project=kaul-pilot \
  --opt com.docker.network.bridge.gateway_mode_ipv4=routed \
  "$DIRECT_NETWORK_NAME" >/dev/null
if run_operator verify >/dev/null 2>&1; then
  die "A routed Pilot Docker network was accepted."
fi
inner docker network rm "$DIRECT_NETWORK_NAME" >/dev/null

inner docker run --detach --name caddy --restart=always \
  --label com.docker.compose.project=kaul-pilot \
  --label com.docker.compose.service=caddy \
  --publish "$HOST_IP:8080:8080" "$PEER_IMAGE" \
  sh -c 'exec nc -ll -p 8080 -e cat' >/dev/null
docker run --detach --network "$NETWORK_NAME" --ip "$NPM_IP" \
  --name "$NPM_NAME" "$PEER_IMAGE" sleep infinity >/dev/null
docker run --detach --network "$NETWORK_NAME" --ip "$LAN_IP" \
  --name "$LAN_NAME" "$PEER_IMAGE" sleep infinity >/dev/null
docker exec "$LAN_NAME" apk add --no-cache coreutils >/dev/null
docker exec --detach "$NPM_NAME" nc -ll -p 18080 -e cat
install_ufw_input_model
sleep 2
run_verify
assert_no_pilot_environment
protected_ip=$(inner docker inspect --format \
  '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' caddy)
[ -n "$protected_ip" ] || die "The protected workload IP could not be resolved."
assert_docker_proxy_listener
publication_dnat_rule -C ||
  die "The Docker-published TCP/8080 DNAT rule was absent before the direct-proxy regression."
if direct_proxy_conntrack_entry | grep -q .; then
  die "The fixed direct-proxy conntrack tuple existed before the regression."
fi
stop_inner_docker
if publication_dnat_rule -C >/dev/null 2>&1; then
  die "The TCP/8080 DNAT rule remained during the pre-DNAT tuple setup."
fi
if inner pgrep -x docker-proxy >/dev/null 2>&1 ||
  inner ss -H -ltnp 'sport = :8080' | grep -q .; then
  die "A Docker proxy or TCP/8080 listener remained during the pre-DNAT tuple setup."
fi
inner iptables -w 10 -t raw -I OUTPUT 1 \
  -s "$HOST_IP/32" -d "$LAN_IP/32" \
  -p tcp --sport 8080 --dport "$DIRECT_PROXY_SOURCE_PORT" \
  --tcp-flags RST RST \
  -m comment --comment "$DIRECT_PROXY_SETUP_COMMENT" -j DROP
inner iptables -w 10 -t filter -I "$UFW_INPUT_CHAIN" 3 \
  -i eth0 -s "$LAN_IP/32" -d "$HOST_IP/32" \
  -p tcp --sport "$DIRECT_PROXY_SOURCE_PORT" --dport 8080 \
  -m conntrack --ctstate NEW \
  -m comment --comment "$DIRECT_PROXY_SETUP_COMMENT" -j ACCEPT
if docker exec "$LAN_NAME" sh -c \
  "printf '%s' pre-dnat-fixed-tuple | nc -p $DIRECT_PROXY_SOURCE_PORT -w 1 $HOST_IP 8080" \
  >/dev/null 2>&1; then
  die "The fixed unauthorized tuple connected while TCP/8080 DNAT was absent."
fi
assert_direct_proxy_conntrack_entry
inner iptables -w 10 -t filter -D "$UFW_INPUT_CHAIN" \
  -i eth0 -s "$LAN_IP/32" -d "$HOST_IP/32" \
  -p tcp --sport "$DIRECT_PROXY_SOURCE_PORT" --dport 8080 \
  -m conntrack --ctstate NEW \
  -m comment --comment "$DIRECT_PROXY_SETUP_COMMENT" -j ACCEPT
inner iptables -w 10 -t raw -D OUTPUT \
  -s "$HOST_IP/32" -d "$LAN_IP/32" \
  -p tcp --sport 8080 --dport "$DIRECT_PROXY_SOURCE_PORT" \
  --tcp-flags RST RST \
  -m comment --comment "$DIRECT_PROXY_SETUP_COMMENT" -j DROP
if inner iptables -w 10 -t filter -S "$UFW_INPUT_CHAIN" |
  grep -Fq -- "--comment $DIRECT_PROXY_SETUP_COMMENT" ||
  inner iptables -w 10 -t raw -S OUTPUT |
    grep -Fq -- "--comment $DIRECT_PROXY_SETUP_COMMENT"; then
  die "A pre-DNAT tuple-setup rule remained after tuple creation."
fi
start_inner_docker
sleep 2
publication_dnat_rule -C ||
  die "The Docker-published TCP/8080 DNAT rule was not restored."
assert_docker_proxy_listener
run_verify

inner iptables -w 10 -t filter -I "$UFW_INPUT_CHAIN" 3 \
  -i eth0 -s "$LAN_IP/32" -d "$HOST_IP/32" \
  -p tcp --sport "$DIRECT_PROXY_SOURCE_PORT" --dport 8080 \
  -m conntrack --ctstate NEW \
  -m comment --comment "$DIRECT_PROXY_TUPLE_COMMENT"
tuple_count_before=$(direct_proxy_tuple_count)
ufw_drop_before=$(ufw_input_drop_count)
[ "$tuple_count_before" -eq 0 ] ||
  die "The exact direct-proxy tuple counter was not initially zero."
if docker exec "$LAN_NAME" sh -c \
  "printf '%s' restored-dnat-fixed-tuple | nc -p $DIRECT_PROXY_SOURCE_PORT -w 1 $HOST_IP 8080" \
  >/dev/null 2>&1; then
  die "The fixed unauthorized tuple reached docker-proxy after DNAT restoration."
fi
tuple_count_after=$(direct_proxy_tuple_count)
ufw_drop_after=$(ufw_input_drop_count)
[ "$tuple_count_after" -gt "$tuple_count_before" ] ||
  die "The exact NEW/UNREPLIED tuple did not traverse the UFW INPUT model."
[ $((ufw_drop_after - ufw_drop_before)) -eq \
  $((tuple_count_after - tuple_count_before)) ] ||
  die "The UFW INPUT drop evidence did not correspond to the exact fixed tuple."
assert_direct_proxy_conntrack_entry
inner iptables -w 10 -t filter -D "$UFW_INPUT_CHAIN" \
  -i eth0 -s "$LAN_IP/32" -d "$HOST_IP/32" \
  -p tcp --sport "$DIRECT_PROXY_SOURCE_PORT" --dport 8080 \
  -m conntrack --ctstate NEW \
  -m comment --comment "$DIRECT_PROXY_TUPLE_COMMENT"
if inner iptables -w 10 -t filter -S "$UFW_INPUT_CHAIN" |
  grep -Fq -- "--comment $DIRECT_PROXY_TUPLE_COMMENT"; then
  die "The exact direct-proxy tuple counter remained after the regression."
fi
run_verify
printf '%s\n' "The disposable UFW INPUT model denied the deterministic same-tuple direct Docker proxy path."
inner iptables -w 10 -t nat -I PREROUTING 1 -d "$HOST_IP/32" \
  -p tcp --dport 8080 -j DNAT --to-destination 192.168.1.250:8080
if run_operator verify >/dev/null 2>&1; then
  die "A foreign target DNAT rule was accepted."
fi
inner iptables -w 10 -t nat -D PREROUTING -d "$HOST_IP/32" \
  -p tcp --dport 8080 -j DNAT --to-destination 192.168.1.250:8080
inner iptables -w 10 -t nat -I PREROUTING 1 -d 192.168.1.0/24 \
  -p tcp --dport 8080 -j DNAT --to-destination 192.168.1.250:8080
if run_operator verify >/dev/null 2>&1; then
  die "A broader-CIDR target DNAT rule was accepted."
fi
inner iptables -w 10 -t nat -D PREROUTING -d 192.168.1.0/24 \
  -p tcp --dport 8080 -j DNAT --to-destination 192.168.1.250:8080
inner iptables -w 10 -t nat -I PREROUTING 1 -d "$HOST_IP/32" \
  -p tcp -m multiport --dports 8000:9000 \
  -j DNAT --to-destination 192.168.1.250:8080
if run_operator verify >/dev/null 2>&1; then
  die "A multiport range target DNAT rule was accepted."
fi
inner iptables -w 10 -t nat -D PREROUTING -d "$HOST_IP/32" \
  -p tcp -m multiport --dports 8000:9000 \
  -j DNAT --to-destination 192.168.1.250:8080
run_verify
assert_no_pilot_environment
probe_allowed || die "The synthetic NPM peer was not allowed."
probe_denied

inner iptables -w 10 -t filter -D DOCKER-USER \
  -p tcp -m conntrack \
  --ctorigdst "$HOST_IP" --ctorigdstport 8080 \
  -m comment --comment "$OWNED_COMMENT" -j "$OWNED_CHAIN"
docker exec "$LAN_NAME" sh -c \
  "(printf before; sleep 4; printf after; sleep 2) | nc -w 10 $HOST_IP 8080 > /tmp/established.out; test \"\$(cat /tmp/established.out)\" = before" &
established_probe_pid=$!
sleep 2
insert_owned_jump
if ! wait "$established_probe_pid"; then
  die "The unauthorized established connection survived policy reapplication."
fi
printf '%s\n' "The unauthorized established connection was cut off without a broad established-flow exception."
probe_denied

inner docker run --rm "$PEER_IMAGE" sh -c \
  "printf '%s\\n' egress-ok | nc -w 3 $NPM_IP 18080" | grep -Fxq egress-ok
[ -z "$(inner ss -H -ltn '( sport = :3000 or sport = :5432 )')" ] ||
  die "Kaul or PostgreSQL rehearsal ports were exposed."

start_restart_diagnostics
set_restart_phase baseline-protected
docker exec "$LAN_NAME" rm -f /tmp/restart-window /tmp/stop-restart-probe \
  /tmp/restart-attempts.log /tmp/restart-first-success.log \
  /tmp/restart-probe-ready-1 /tmp/restart-probe-ready-2 \
  /tmp/restart-probe-ready-3 /tmp/restart-probe-ready-4
restart_probe_pids=()
for worker in 1 2 3 4; do
  docker exec "$LAN_NAME" sh -c \
    "attempt=0; touch /tmp/restart-probe-ready-$worker; while [ ! -e /tmp/stop-restart-probe ]; do attempt=\$((attempt + 1)); phase=\$(cat /tmp/restart-phase); started=\$(date -u +'%Y-%m-%dT%H:%M:%S.%N'); token=kaul-restart-$worker-\${attempt}-\${started}; response=\$(printf '%s' \"\$token\" | nc -w 1 $HOST_IP 8080 2>/dev/null); status=\$?; ended=\$(date -u +'%Y-%m-%dT%H:%M:%S.%N'); result=denied; if [ \"\$response\" = \"\$token\" ]; then result=echoed-new-connection; touch /tmp/restart-window; fi; record=\"\$ended worker=$worker attempt=\$attempt phase=\$phase status=\$status result=\$result token=\$token\"; printf '%s\\n' \"\$record\" >> /tmp/restart-attempts.log; if [ \"\$result\" = echoed-new-connection ] && [ ! -e /tmp/restart-first-success.log ]; then printf '%s\\n' \"\$record\" > /tmp/restart-first-success.log; fi; done" &
  restart_probe_pids+=("$!")
done
for _attempt in $(seq 1 30); do
  if docker exec "$LAN_NAME" sh -c \
    'test -e /tmp/restart-probe-ready-1 && test -e /tmp/restart-probe-ready-2 && test -e /tmp/restart-probe-ready-3 && test -e /tmp/restart-probe-ready-4'; then
    break
  fi
  sleep 0.1
done
docker exec "$LAN_NAME" sh -c \
  'test -e /tmp/restart-probe-ready-1 && test -e /tmp/restart-probe-ready-2 && test -e /tmp/restart-probe-ready-3 && test -e /tmp/restart-probe-ready-4' ||
  die "The continuous unauthorized restart probe did not become ready."

set_restart_phase docker-stopping
stop_inner_docker
set_restart_phase docker-stopped
inner iptables -w 10 -t filter -D DOCKER-USER \
  -p tcp -m conntrack \
  --ctorigdst "$HOST_IP" --ctorigdstport 8080 \
  -m comment --comment "$OWNED_COMMENT" -j "$OWNED_CHAIN"
inner iptables -w 10 -t filter -A DOCKER-USER \
  -p tcp -m conntrack \
  --ctorigdst "$HOST_IP" --ctorigdstport 8080 \
  -m comment --comment "$OWNED_COMMENT" -j "$OWNED_CHAIN"
inner iptables -w 10 -t filter -D FORWARD -j DOCKER-USER
set_restart_phase stopped-firewall-corrupted
set_restart_phase gate-c-preflight
run_operator preflight
set_restart_phase gate-c-apply
run_operator apply
set_restart_phase gate-c-applied-before-docker-start
assert_no_pilot_environment
inner iptables -w 10 -t filter -S FORWARD | sed -n '2p' |
  grep -Fxq -- '-A FORWARD -j DOCKER-USER' ||
  die "The canonical FORWARD transfer was absent before the Docker restart probe."
set_restart_phase docker-starting
start_inner_docker
set_restart_phase docker-ready-workload-restoring
sleep 2
set_restart_phase gate-c-verify
run_verify
set_restart_phase gate-c-verified
assert_no_pilot_environment
probe_allowed
probe_denied
set_restart_phase final-negative-check-complete
docker exec "$LAN_NAME" touch /tmp/stop-restart-probe
for restart_probe_pid in "${restart_probe_pids[@]}"; do
  if ! wait "$restart_probe_pid"; then
    die "A continuous unauthorized restart probe worker exited before completing."
  fi
done
stop_restart_diagnostics
if ! docker exec "$LAN_NAME" test ! -e /tmp/restart-window; then
  dump_restart_diagnostics
  die "A uniquely echoed unauthorized connection succeeded during Docker stop, firewall reconciliation, startup, or restart-policy workload restoration."
fi
printf '%s\n' "The continuous unauthorized probe never connected during Docker stop, firewall reconciliation, startup, and verified restart-policy workload restoration."

insert_owned_jump
if run_operator verify >/dev/null 2>&1; then
  die "Intentional duplicate-jump corruption was not detected."
fi
inner iptables -w 10 -t filter -D DOCKER-USER 1
run_verify
assert_no_pilot_environment

stop_inner_docker
inner rm -f /var/run/docker.sock
run_operator remove
inner iptables -w 10 -t filter -S DOCKER-USER |
  grep -Fq -- '--comment foreign-sentinel -j RETURN'
if inner iptables -w 10 -t filter -S FORWARD |
  grep -Eq -- ' -(j|g) DOCKER-USER( |$)'; then
  die "A FORWARD transfer to DOCKER-USER remained after removal."
fi
inner iptables -w 10 -t filter -S FORWARD |
  grep -Fq -- '--comment foreign-forward-sentinel -j RETURN'
if inner iptables -w 10 -t filter -S "$OWNED_CHAIN" >/dev/null 2>&1; then
  die "The Kaul-owned chain remained after removal."
fi

printf '%s\n' "Exact Docker 29.7.2 DNAT/DOCKER-USER rehearsal passed."
printf '%s\n' "This container rehearsal does not prove a real systemd boot or host reboot."
