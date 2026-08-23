#!/usr/bin/env bash

set -Eeuo pipefail

readonly DIND_IMAGE="docker@sha256:ab772b0eaf0b01e5843f6574e50ccdfc34a7bdcb82bbf2decafde54a0ee884a9"
readonly PEER_IMAGE="alpine@sha256:7c8cb692ae09657cbc4a3f3cbd0e8d5a2690ba38386aaaf252dbb060bf5eb2e6"
readonly NETWORK_NAME="kaul-firewall-rehearsal-${GITHUB_RUN_ID:-local}-$$"
readonly DIND_NAME="${NETWORK_NAME}-dind"
readonly DIND_VOLUME="${NETWORK_NAME}-data"
readonly DIRECT_NETWORK_NAME="${NETWORK_NAME}-direct"
readonly NPM_NAME="${NETWORK_NAME}-npm"
readonly LAN_NAME="${NETWORK_NAME}-lan"
readonly HOST_IP="192.168.1.120"
readonly NPM_IP="192.168.1.100"
readonly LAN_IP="192.168.1.101"
readonly OWNED_CHAIN="KAUL-PILOT-CADDY"
readonly OWNED_COMMENT="kaul-pilot-private-caddy"

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
  docker rm --force --volumes "$NPM_NAME" "$LAN_NAME" "$DIND_NAME" >/dev/null 2>&1
  docker network rm "$NETWORK_NAME" >/dev/null 2>&1
  docker volume rm "$DIND_VOLUME" >/dev/null 2>&1
  local resource
  for resource in "$NPM_NAME" "$LAN_NAME" "$DIND_NAME"; do
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
    'dockerd-entrypoint.sh --host=unix:///var/run/docker.sock --firewall-backend=iptables > /tmp/dockerd.log 2>&1'
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

insert_owned_jump() {
  inner iptables -w 10 -t filter -I DOCKER-USER 1 \
    -p tcp -m conntrack \
    --ctorigdst "$HOST_IP" --ctorigdstport 8080 \
    -m comment --comment "$OWNED_COMMENT" -j "$OWNED_CHAIN"
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
  "$DIND_IMAGE" sleep infinity >/dev/null

inner apk add --no-cache bash iproute2 perl procps curl >/dev/null
inner install -d -m 0755 /usr/local/libexec
inner install -m 0755 /source/deploy/pilot/firewall/kaul-pilot-firewall \
  /usr/local/libexec/kaul-pilot-firewall
inner install -d -m 0700 /etc/kaul
inner install -d -m 0755 /etc/docker
inner sh -c 'umask 077; printf "%s\n" \
  "COMPOSE_PROJECT_NAME=kaul-pilot" \
  "PILOT_ENV_FILE=/etc/kaul/pilot.env" \
  "INGRESS_INTERFACE=eth0" \
  "HOST_IPV4_CIDR=192.168.1.120/24" \
  "TRUSTED_NPM_IPV4=192.168.1.100" \
  "PUBLISHED_TCP_PORT=8080" > /etc/kaul/pilot-firewall.conf'
inner chmod 0644 /etc/kaul/pilot-firewall.conf
inner sh -c 'umask 077; printf "%s\n" \
  "COMPOSE_PROJECT_NAME=kaul-pilot" \
  "PILOT_INGRESS_MODE=npm" \
  "PILOT_CADDY_PRIVATE_BIND=192.168.1.120:8080" \
  "PILOT_NPM_TRUSTED_PROXY_CIDR=192.168.1.100/32" > /etc/kaul/pilot.env'
inner sh -c 'cat > /usr/local/bin/systemctl <<"EOF"
#!/bin/sh
case "$1:$2" in
  show:--property=ExecStart) printf "%s\n" "{ path=/usr/local/bin/dockerd ; argv[]=/usr/local/bin/dockerd ; }" ;;
  is-active:docker.socket|is-active:docker.service) printf "%s\n" inactive; exit 3 ;;
  stop:docker.socket) exit 0 ;;
  *) exit 1 ;;
esac
EOF
chmod 0755 /usr/local/bin/systemctl'

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
inner mv /etc/kaul/pilot.env /etc/kaul/pilot.env.regular
inner mkfifo -m 0600 /etc/kaul/pilot.env
set +e
inner timeout 2 /usr/local/libexec/kaul-pilot-firewall preflight \
  --config /etc/kaul/pilot-firewall.conf >/dev/null 2>&1
fifo_status=$?
set -e
[ "$fifo_status" -ne 0 ] || die "A FIFO Pilot environment was accepted."
[ "$fifo_status" -ne 124 ] || die "A FIFO Pilot environment blocked preflight."
inner rm /etc/kaul/pilot.env
inner mv /etc/kaul/pilot.env.regular /etc/kaul/pilot.env
inner chmod 0666 /etc/kaul/pilot-firewall.conf
if run_operator preflight >/dev/null 2>&1; then
  die "A loosely permissioned root configuration was accepted."
fi
inner chmod 0644 /etc/kaul/pilot-firewall.conf

inner iptables -w 10 -t filter -N DOCKER-USER
inner iptables -w 10 -t filter -A DOCKER-USER \
  -m comment --comment foreign-sentinel -j RETURN
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
run_operator apply
first_state=$(inner iptables-save -t filter)
second_apply=$(run_operator apply)
[ "$second_apply" = "Kaul-owned firewall state is already exact; no rules changed." ] ||
  die "The second application was not an explicit no-op."
[ "$first_state" = "$(inner iptables-save -t filter)" ] ||
  die "The idempotent application changed the ruleset."
inner iptables -w 10 -t filter -S DOCKER-USER |
  sed -n '2p' | grep -Fq -- "--comment $OWNED_COMMENT -j $OWNED_CHAIN"
inner iptables -w 10 -t filter -S DOCKER-USER |
  grep -Fq -- '--comment foreign-sentinel -j RETURN'
inner iptables -w 10 -t filter -A DOCKER-USER -g "$OWNED_CHAIN"
if run_operator apply >/dev/null 2>&1; then
  die "A foreign goto reference to the Kaul-owned chain was accepted."
fi
inner iptables -w 10 -t filter -D DOCKER-USER -g "$OWNED_CHAIN"

start_inner_docker
run_operator verify
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
docker exec "$NPM_NAME" sh -c \
  'mkdir -p /tmp/egress; printf "%s\n" egress-ok > /tmp/egress/index.html'
docker exec --detach "$NPM_NAME" httpd -f -p 18080 -h /tmp/egress
sleep 2
run_operator verify
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
run_operator verify
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

inner docker run --rm "$PEER_IMAGE" wget -qO- \
  "http://$NPM_IP:18080" | grep -Fxq egress-ok
[ -z "$(inner ss -H -ltn '( sport = :3000 or sport = :5432 )')" ] ||
  die "Kaul or PostgreSQL rehearsal ports were exposed."

stop_inner_docker
inner iptables -w 10 -t filter -D DOCKER-USER \
  -p tcp -m conntrack \
  --ctorigdst "$HOST_IP" --ctorigdstport 8080 \
  -m comment --comment "$OWNED_COMMENT" -j "$OWNED_CHAIN"
inner iptables -w 10 -t filter -A DOCKER-USER \
  -p tcp -m conntrack \
  --ctorigdst "$HOST_IP" --ctorigdstport 8080 \
  -m comment --comment "$OWNED_COMMENT" -j "$OWNED_CHAIN"
inner iptables -w 10 -t filter -D FORWARD -j DOCKER-USER
run_operator preflight
run_operator apply
docker exec "$LAN_NAME" sh -c \
  "rm -f /tmp/restart-window /tmp/stop-restart-probe; while [ ! -e /tmp/stop-restart-probe ]; do if printf probe | nc -w 1 $HOST_IP 8080 >/dev/null 2>&1; then touch /tmp/restart-window; fi; done" &
restart_probe_pid=$!
start_inner_docker
sleep 2
docker exec "$LAN_NAME" touch /tmp/stop-restart-probe
wait "$restart_probe_pid"
docker exec "$LAN_NAME" test ! -e /tmp/restart-window ||
  die "An unauthorized connection succeeded while Docker restored its restart-policy workload."
run_operator verify
probe_allowed
probe_denied
printf '%s\n' "Docker restart recreated its first FORWARD jump before the denied restart-policy workload became reachable."

insert_owned_jump
if run_operator verify >/dev/null 2>&1; then
  die "Intentional duplicate-jump corruption was not detected."
fi
inner iptables -w 10 -t filter -D DOCKER-USER 1
run_operator verify

stop_inner_docker
inner rm -f /var/run/docker.sock
run_operator remove
inner iptables -w 10 -t filter -S DOCKER-USER |
  grep -Fq -- '--comment foreign-sentinel -j RETURN'
if inner iptables -w 10 -t filter -S "$OWNED_CHAIN" >/dev/null 2>&1; then
  die "The Kaul-owned chain remained after removal."
fi

printf '%s\n' "Exact Docker 29.7.2 DNAT/DOCKER-USER rehearsal passed."
printf '%s\n' "This container rehearsal does not prove a real systemd boot or host reboot."
