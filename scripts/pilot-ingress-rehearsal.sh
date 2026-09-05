#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BASE_COMPOSE_FILE="$REPOSITORY_ROOT/compose.pilot.yaml"
NPM_COMPOSE_FILE="$REPOSITORY_ROOT/compose.pilot.npm.yaml"
PUBLIC_COMPOSE_FILE="$REPOSITORY_ROOT/compose.pilot.public.yaml"
WORK_DIRECTORY=$(mktemp -d)
PROJECT_NAME="kaul-pilot-ingress-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-0}"
ENV_FILE="$WORK_DIRECTORY/pilot.env"
DOCUMENT_STORAGE_DIRECTORY="$WORK_DIRECTORY/documents"
OVERRIDE_FILE="$WORK_DIRECTORY/compose.rehearsal.yaml"
STUB_CADDYFILE="$WORK_DIRECTORY/Caddyfile.stub"
NPM_PEER_IP=172.31.251.10
UNTRUSTED_PEER_IP=172.31.251.11
CADDY_IP=172.31.251.20
DIAGNOSTICS_ENABLED=false

compose_npm() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --project-directory "$REPOSITORY_ROOT" \
    --env-file "$ENV_FILE" \
    -f "$BASE_COMPOSE_FILE" \
    -f "$NPM_COMPOSE_FILE" \
    -f "$OVERRIDE_FILE" \
    "$@"
}

compose_public() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --project-directory "$REPOSITORY_ROOT" \
    --env-file "$ENV_FILE" \
    -f "$BASE_COMPOSE_FILE" \
    -f "$PUBLIC_COMPOSE_FILE" \
    -f "$OVERRIDE_FILE" \
    "$@"
}

project_resources_remain() {
  container_ids=$(docker ps --all --quiet \
    --filter "label=com.docker.compose.project=$PROJECT_NAME") || return 2
  network_ids=$(docker network ls --quiet \
    --filter "label=com.docker.compose.project=$PROJECT_NAME") || return 2
  volume_ids=$(docker volume ls --quiet \
    --filter "label=com.docker.compose.project=$PROJECT_NAME") || return 2
  [ -n "$container_ids$network_ids$volume_ids" ]
}

cleanup() {
  exit_status=$?
  trap - EXIT
  if [ "$exit_status" -ne 0 ] && [ "$DIAGNOSTICS_ENABLED" = true ]; then
    printf '%s\n' 'Ingress rehearsal failed. Disposable service status:' >&2
    compose_npm ps --all >&2 || true
    printf '%s\n' 'Disposable Kaul-stub and Caddy logs:' >&2
    compose_npm logs --no-color --tail 100 kaul caddy >&2 || true
  fi
  if [ "$DIAGNOSTICS_ENABLED" = true ]; then
    if ! compose_npm down --volumes --remove-orphans >/dev/null 2>&1; then
      printf '%s\n' 'ERROR: Disposable ingress teardown failed.' >&2
      [ "$exit_status" -ne 0 ] || exit_status=1
    elif project_resources_remain; then
      printf '%s\n' 'ERROR: Disposable ingress resources remain after teardown.' >&2
      [ "$exit_status" -ne 0 ] || exit_status=1
    else
      resource_status=$?
      if [ "$resource_status" -eq 1 ]; then
        printf '%s\n' 'Disposable ingress container, network, and volume teardown verified.'
      else
        printf '%s\n' 'ERROR: Disposable ingress teardown could not be verified.' >&2
        [ "$exit_status" -ne 0 ] || exit_status=1
      fi
    fi
  fi
  rm -rf -- "$WORK_DIRECTORY"
  exit "$exit_status"
}
trap cleanup EXIT

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

wait_for_stub() {
  for _ in $(seq 1 30); do
    if compose_npm exec -T kaul wget -q -O /dev/null \
      http://127.0.0.1:3000/; then
      return
    fi
    sleep 1
  done
  fail "The disposable Kaul header-echo stub did not become ready."
}

wait_for_caddy_upstream() {
  for _ in $(seq 1 30); do
    if compose_npm exec -T caddy wget -q -O /dev/null \
      http://kaul:3000/; then
      return
    fi
    sleep 1
  done
  fail "Caddy could not reach the disposable Kaul stub on the private network."
}

wait_for_trusted_ingress() {
  for _ in $(seq 1 30); do
    if compose_npm exec -T npm-probe wget -q -O /dev/null \
      --header='Host: pilot-ci.invalid' http://caddy:8080/; then
      return
    fi
    sleep 1
  done
  fail "The trusted synthetic NPM peer could not reach Kaul through Caddy."
}

for command_name in curl docker grep mktemp python3 sed uname; do
  command -v "$command_name" >/dev/null 2>&1 ||
    fail "$command_name is required."
done

[ "$(uname -s)" = Linux ] || fail "The ingress rehearsal must run on Linux."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."

CADDY_IMAGE=$(sed -n 's/^    image: \(caddy:[^[:space:]]*\)$/\1/p' \
  "$BASE_COMPOSE_FILE")
printf '%s\n' "$CADDY_IMAGE" |
  grep -Eq '^caddy:[^@[:space:]]+@sha256:[0-9a-f]{64}$' ||
  fail "The base Compose file must pin Caddy by digest."

PRIVATE_PORT=$(python3 - <<'PY'
import socket

with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    print(listener.getsockname()[1])
PY
)

umask 077
mkdir -m 700 "$DOCUMENT_STORAGE_DIRECTORY"
PERSONNUMMER_KEYRING_FILE="$WORK_DIRECTORY/personnummer-keyring.json"
printf '%s\n' '{"formatVersion":1,"activeKeyId":"fictional-ci-key","keys":[{"id":"fictional-ci-key","key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}]}' > "$PERSONNUMMER_KEYRING_FILE"
chmod 400 "$PERSONNUMMER_KEYRING_FILE"
cat > "$STUB_CADDYFILE" <<'EOF'
:3000 {
	respond "{http.request.host}|{http.request.header.X-Real-IP}|{http.request.header.X-Forwarded-For}|{http.request.header.X-Forwarded-Host}|{http.request.header.X-Forwarded-Proto}|{http.request.header.Forwarded}|{http.request.header.CF-Connecting-IP}|{http.request.header.True-Client-IP}" 200
}
EOF

cat > "$ENV_FILE" <<EOF
COMPOSE_PROJECT_NAME=$PROJECT_NAME
KAUL_IMAGE=ghcr.io/fictional-kaul/kaul@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
PILOT_HOSTNAME=pilot-ci.invalid
PILOT_INGRESS_MODE=npm
PILOT_CADDY_PRIVATE_BIND=127.0.0.1:$PRIVATE_PORT
PILOT_NPM_TRUSTED_PROXY_CIDR=$NPM_PEER_IP/32
DEPLOYMENT_ENV=pilot
BETTER_AUTH_URL=https://pilot-ci.invalid
BETTER_AUTH_SECRET=fictional-ci-auth-secret-2026-000000000000
KAUL_PERSONNUMMER_KEYRING_HOST_FILE=$PERSONNUMMER_KEYRING_FILE
DOCUMENT_STORAGE_HOST_PATH=$DOCUMENT_STORAGE_DIRECTORY
POSTGRES_ADMIN_USER=kaul_pilot_admin
POSTGRES_ADMIN_PASSWORD=fictional-ci-admin-secret-2026-000000000
KAUL_DB_USER=kaul_pilot_app
KAUL_DB_PASSWORD=fictional-ci-app-secret-2026-00000000000
KAUL_DB_NAME=kaul_pilot_ci
DATABASE_URL=postgresql://kaul_pilot_app:fictional-ci-app-secret-2026-00000000000@postgres:5432/kaul_pilot_ci
EOF

cat > "$OVERRIDE_FILE" <<EOF
services:
  caddy:
    networks:
      edge:
        ipv4_address: $CADDY_IP
      private: {}
  kaul:
    image: $CADDY_IMAGE
    entrypoint: ["caddy"]
    command: ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
    # The official Caddy binary carries cap_net_bind_service=ep. The Kaul
    # service drops every capability, so the rehearsal stub must add back the
    # same single capability as the real Caddy service to execute that binary.
    cap_add: ["NET_BIND_SERVICE"]
    volumes:
      - $STUB_CADDYFILE:/etc/caddy/Caddyfile:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/"]
      interval: 1s
      timeout: 2s
      retries: 20
  npm-probe:
    image: $CADDY_IMAGE
    entrypoint: ["/bin/sleep"]
    command: ["300"]
    networks:
      edge:
        ipv4_address: $NPM_PEER_IP
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
  untrusted-probe:
    image: $CADDY_IMAGE
    entrypoint: ["/bin/sleep"]
    command: ["300"]
    networks:
      edge:
        ipv4_address: $UNTRUSTED_PEER_IP
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
networks:
  edge:
    ipam:
      config:
        - subnet: 172.31.251.0/24
EOF
# The stub contains only the static fictional response contract. Its
# capability-dropped container cannot bypass host ownership on a 0600 bind
# mount, so make that one non-secret file readable while keeping generated
# environment and Compose inputs operator-only.
chmod 644 "$STUB_CADDYFILE"
chmod 600 "$ENV_FILE" "$OVERRIDE_FILE"
DIAGNOSTICS_ENABLED=true

export PILOT_INGRESS_MODE=public
PUBLIC_RENDERED="$WORK_DIRECTORY/public-compose.json"
compose_public config --format json > "$PUBLIC_RENDERED"
python3 - "$PUBLIC_RENDERED" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    rendered = json.load(source)

services = rendered["services"]
for unpublished in ("kaul", "postgres"):
    if services[unpublished].get("ports"):
        raise SystemExit(f"{unpublished} unexpectedly publishes a host port")

published = {
    (str(port.get("published")), port.get("target"), port.get("protocol"))
    for port in services["caddy"].get("ports", [])
}
expected = {("80", 80, "tcp"), ("443", 443, "tcp"), ("443", 443, "udp")}
if published != expected:
    raise SystemExit("Public mode does not publish exactly Caddy 80/tcp and 443/tcp+udp")
PY
compose_public run --rm --no-deps --entrypoint caddy caddy \
  validate --config /etc/caddy/Caddyfile --adapter caddyfile

export PILOT_INGRESS_MODE=npm
NPM_RENDERED="$WORK_DIRECTORY/npm-compose.json"
compose_npm config --format json > "$NPM_RENDERED"
python3 - "$NPM_RENDERED" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    rendered = json.load(source)

services = rendered["services"]
for unpublished in ("kaul", "postgres"):
    if services[unpublished].get("ports"):
        raise SystemExit(f"{unpublished} unexpectedly publishes a host port")

ports = services["caddy"].get("ports", [])
if len(ports) != 1:
    raise SystemExit("NPM mode must publish exactly one Caddy port")
port = ports[0]
if (
    port.get("host_ip") != "127.0.0.1"
    or port.get("target") != 8080
    or port.get("protocol") != "tcp"
):
    raise SystemExit("The rehearsal Caddy port is not a loopback-only TCP 8080 binding")
PY

compose_npm run --rm --no-deps --entrypoint caddy kaul \
  validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose_npm up -d --no-deps kaul
wait_for_stub
compose_npm up -d --no-deps npm-probe untrusted-probe
compose_npm up -d --no-deps caddy
wait_for_caddy_upstream
wait_for_trusted_ingress

EXPECTED_RESPONSE='pilot-ci.invalid|198.51.100.23|198.51.100.23|pilot-ci.invalid|https|||'
ACTUAL_RESPONSE=$(compose_npm exec -T npm-probe wget -q -O - \
  --header='Host: pilot-ci.invalid' \
  --header='X-Real-IP: 192.0.2.90' \
  --header='X-Forwarded-For: 192.0.2.90, 198.51.100.23' \
  --header='X-Forwarded-Host: attacker.invalid' \
  --header='X-Forwarded-Proto: http' \
  --header='Forwarded: for=192.0.2.90;proto=http' \
  --header='CF-Connecting-IP: 192.0.2.90' \
  --header='True-Client-IP: 192.0.2.90' \
  http://caddy:8080/)
[ "$ACTUAL_RESPONSE" = "$EXPECTED_RESPONSE" ] ||
  fail "Caddy did not produce the expected sanitized upstream metadata."

if compose_npm exec -T untrusted-probe wget -q -O /dev/null \
  --header='Host: pilot-ci.invalid' http://caddy:8080/; then
  fail "A non-NPM Docker peer reached the private Caddy listener."
fi

PUBLISHED_BINDING=$(compose_npm port caddy 8080)
[ "$PUBLISHED_BINDING" = "127.0.0.1:$PRIVATE_PORT" ] ||
  fail "Caddy was not published on the expected loopback-only host binding."
if curl --fail --silent --show-error --max-time 3 \
  --header 'Host: pilot-ci.invalid' \
  "http://127.0.0.1:$PRIVATE_PORT/" >/dev/null 2>&1; then
  fail "A direct host request reached the private Caddy listener."
fi

printf '%s\n' \
  'Disposable Linux ingress rehearsal passed: private binding, peer restriction, header sanitization, unpublished services, and public Caddy configuration.'
