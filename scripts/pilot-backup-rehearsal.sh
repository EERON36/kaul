#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE="$REPOSITORY_ROOT/compose.pilot.yaml"
WORK_DIRECTORY=$(mktemp -d)
PROJECT_NAME="kaul-pilot-backup-ci-${GITHUB_RUN_ID:-$$}"
ENV_FILE="$WORK_DIRECTORY/pilot.env"
PASSWORD_FILE="$WORK_DIRECTORY/restic-password"
REST_SERVER_LOG="$WORK_DIRECTORY/rest-server.log"
REST_SERVER_PID=
RESTIC_REPOSITORY="rest:http://127.0.0.1:18080/kaul-ci/"
export RESTIC_REPOSITORY
export RESTIC_PASSWORD_FILE="$PASSWORD_FILE"

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --project-directory "$REPOSITORY_ROOT" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

wait_for_postgres() {
  for _ in $(seq 1 60); do
    if compose exec -T postgres sh -ec '
      [ "$(cat /proc/1/comm)" = postgres ] || exit 1
      pg_isready --username="$KAUL_DB_USER" --dbname="$KAUL_DB_NAME" >/dev/null 2>&1
      query_result=$(psql \
        --username="$KAUL_DB_USER" \
        --dbname="$KAUL_DB_NAME" \
        --tuples-only \
        --no-align \
        --set=ON_ERROR_STOP=1 \
        --command="SELECT 1;")
      [ "$query_result" = 1 ]
    '; then
      return
    fi
    sleep 1
  done
  printf 'ERROR: PostgreSQL did not become ready.\n' >&2
  return 1
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  if [ -n "$REST_SERVER_PID" ]; then
    kill "$REST_SERVER_PID" >/dev/null 2>&1 || true
    wait "$REST_SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$WORK_DIRECTORY"
}
trap cleanup EXIT

for command_name in curl docker find grep restic rest-server sed seq tr wc; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'ERROR: %s is required.\n' "$command_name" >&2
    exit 1
  }
done

umask 077
printf '%s\n' 'fictional-ci-restic-encryption-password-2026' > "$PASSWORD_FILE"
chmod 600 "$PASSWORD_FILE"

cat > "$ENV_FILE" <<EOF
COMPOSE_PROJECT_NAME=$PROJECT_NAME
KAUL_IMAGE=ghcr.io/fictional-kaul/kaul@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
PILOT_HOSTNAME=pilot-ci.invalid
PILOT_INGRESS_MODE=npm
PILOT_CADDY_PRIVATE_BIND=192.168.50.20:18081
PILOT_NPM_TRUSTED_PROXY_CIDR=192.168.50.10/32
DEPLOYMENT_ENV=pilot
BETTER_AUTH_URL=https://pilot-ci.invalid
BETTER_AUTH_SECRET=fictional-ci-auth-secret-2026-000000000000
POSTGRES_ADMIN_USER=kaul_pilot_admin
POSTGRES_ADMIN_PASSWORD=fictional-ci-admin-secret-2026-000000000
KAUL_DB_USER=kaul_pilot_app
KAUL_DB_PASSWORD=fictional-ci-app-secret-2026-00000000000
KAUL_DB_NAME=kaul_pilot_ci
DATABASE_URL=postgresql://kaul_pilot_app:fictional-ci-app-secret-2026-00000000000@postgres:5432/kaul_pilot_ci
RESTIC_EXPECTED_VERSION=0.19.1
RESTIC_REPOSITORY=$RESTIC_REPOSITORY
RESTIC_PASSWORD_FILE=$PASSWORD_FILE
EOF
chmod 600 "$ENV_FILE"

mkdir -m 700 "$WORK_DIRECTORY/repository"
rest-server \
  --append-only \
  --listen 127.0.0.1:18080 \
  --no-auth \
  --path "$WORK_DIRECTORY/repository" \
  > "$REST_SERVER_LOG" 2>&1 &
REST_SERVER_PID=$!

for _ in $(seq 1 50); do
  if curl --silent --output /dev/null "http://127.0.0.1:18080/"; then
    break
  fi
  sleep 0.1
done
kill -0 "$REST_SERVER_PID"

restic init >/dev/null
"$SCRIPT_DIR/pilot-ops.sh" start-postgres --env-file "$ENV_FILE"
wait_for_postgres

compose exec -T postgres psql \
  --username=kaul_pilot_app \
  --dbname=kaul_pilot_ci \
  --set=ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE backup_rehearsal_fixture (
  id integer PRIMARY KEY,
  marker text NOT NULL
);
INSERT INTO backup_rehearsal_fixture (id, marker)
VALUES (1, 'fictional-restic-round-trip');
CREATE TABLE "_prisma_migrations" (id text PRIMARY KEY);
INSERT INTO "_prisma_migrations" (id) VALUES ('fictional-ci-migration');
SQL

backup_output=$("$SCRIPT_DIR/pilot-ops.sh" backup --env-file "$ENV_FILE")
snapshot_id=$(printf '%s\n' "$backup_output" |
  sed -n 's/^Backup snapshot created and validated: \([0-9a-f]\{64\}\)$/\1/p')
[ "$(printf '%s\n' "$snapshot_id" | grep -c .)" -eq 1 ]
printf '%s\n' "$snapshot_id" | grep -Eq '^[0-9a-f]{64}$'

"$SCRIPT_DIR/pilot-ops.sh" validate-backup \
  --env-file "$ENV_FILE" \
  --snapshot "$snapshot_id"

if find "$WORK_DIRECTORY" -type f -name '*.dump' -print -quit | grep -q .; then
  printf 'ERROR: A completed plaintext dump file was found.\n' >&2
  exit 1
fi

snapshot_count_before=$(restic snapshots --json |
  grep -o '"id":"[0-9a-f]\{64\}"' | wc -l | tr -d ' ')
compose stop postgres
if "$SCRIPT_DIR/pilot-ops.sh" backup --env-file "$ENV_FILE"; then
  printf 'ERROR: Backup unexpectedly succeeded while PostgreSQL was stopped.\n' >&2
  exit 1
fi
snapshot_count_after=$(restic snapshots --json |
  grep -o '"id":"[0-9a-f]\{64\}"' | wc -l | tr -d ' ')
[ "$snapshot_count_after" = "$snapshot_count_before" ]
"$SCRIPT_DIR/pilot-ops.sh" start-postgres --env-file "$ENV_FILE"
wait_for_postgres

compose exec -T postgres createdb \
  --username=kaul_pilot_admin \
  --owner=kaul_pilot_app \
  --template=template0 \
  kaul_restore_ci
restic dump "$snapshot_id" /kaul-pilot.dump |
  compose exec -T postgres pg_restore \
    --username=kaul_pilot_app \
    --dbname=kaul_restore_ci \
    --exit-on-error \
    --single-transaction \
    --no-owner \
    --no-acl

restored_marker=$(compose exec -T postgres psql \
  --username=kaul_pilot_app \
  --dbname=kaul_restore_ci \
  --tuples-only \
  --no-align \
  --command='SELECT marker FROM backup_rehearsal_fixture WHERE id = 1;')
[ "$restored_marker" = fictional-restic-round-trip ]

if restic forget "$snapshot_id" >/dev/null 2>&1; then
  printf 'ERROR: The append-only writer deleted a snapshot.\n' >&2
  exit 1
fi
"$SCRIPT_DIR/pilot-ops.sh" validate-backup \
  --env-file "$ENV_FILE" \
  --snapshot "$snapshot_id"

printf 'Restic append-only backup rehearsal passed for exact snapshot %s.\n' \
  "$snapshot_id"
