#!/usr/bin/env bash
# CI-only fictional rehearsal. The adapter substitutes only the unpublished
# image revision and its exact db:status command, not image packaging. Upload
# scanner evidence is fictional; the separate scanner CI gate checks ClamAV.
set -Eeuo pipefail
[[ ${CI:-} = true && ${GITHUB_ACTIONS:-} = true && ${GITHUB_RUN_ID:-} =~ ^[0-9]+$ && ${GITHUB_SHA:-} =~ ^[0-9a-f]{40}$ ]] || { printf 'ERROR: GitHub CI identity required.\n' >&2; exit 1; }
[[ $(uname -s) = Linux && $(id -u) = 1000 ]] || { printf 'ERROR: Linux pinned operator required.\n' >&2; exit 1; }
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPOSITORY_ROOT"
for required in curl docker node npm restic rest-server; do command -v "$required" >/dev/null; done
umask 077
WORK_DIRECTORY=$(mktemp -d /tmp/kaul-documents-backup-ci.XXXXXXXX)
export KAUL_CI_DOCUMENTS_WORKSPACE="$WORK_DIRECTORY"
export KAUL_CI_REPOSITORY_ROOT="$REPOSITORY_ROOT"
export KAUL_CI_ENV_FILE="$WORK_DIRECTORY/pilot.env"
export KAUL_CI_RESTORE_ROOT="$WORK_DIRECTORY/restored"
export KAUL_CI_REAL_DOCKER
KAUL_CI_REAL_DOCKER=$(command -v docker)
PROJECT_NAME="kaul-pilot-documents-ci-$GITHUB_RUN_ID"
REST_SERVER_PID=
export RESTIC_REPOSITORY=rest:http://127.0.0.1:18082/kaul-documents-ci/
export RESTIC_PASSWORD_FILE="$WORK_DIRECTORY/restic-password"
export KAUL_PERSONNUMMER_KEYRING_FILE="$WORK_DIRECTORY/personnummer-keyring.json"
compose() {
  "$KAUL_CI_REAL_DOCKER" compose --project-name "$PROJECT_NAME" \
    --project-directory "$REPOSITORY_ROOT" --env-file "$KAUL_CI_ENV_FILE" \
    -f "$REPOSITORY_ROOT/compose.pilot.yaml" -f "$WORK_DIRECTORY/ports.yaml" "$@"
}
cleanup() {
  compose stop postgres >/dev/null 2>&1 || true
  if [[ -n "$REST_SERVER_PID" ]]; then kill "$REST_SERVER_PID" 2>/dev/null || true; wait "$REST_SERVER_PID" 2>/dev/null || true; fi
  # The disposable GitHub runner reclaims these fictional volumes and files.
  # This rehearsal never deletes Docker volumes or another project's resources.
}
trap cleanup EXIT
mkdir -m 700 "$WORK_DIRECTORY/documents" "$KAUL_CI_RESTORE_ROOT" "$WORK_DIRECTORY/repository" "$WORK_DIRECTORY/bin"
printf '%s\n' 'fictional-documents-ci-restic-password-2026' > "$RESTIC_PASSWORD_FILE"
printf '%s\n' '{"formatVersion":1,"activeKeyId":"fictional-ci-key","keys":[{"id":"fictional-ci-key","key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}]}' > "$KAUL_PERSONNUMMER_KEYRING_FILE"
chmod 400 "$KAUL_PERSONNUMMER_KEYRING_FILE"
cat > "$KAUL_CI_ENV_FILE" <<EOF
COMPOSE_PROJECT_NAME=$PROJECT_NAME
KAUL_IMAGE=ghcr.io/fictional-kaul/kaul@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
PILOT_HOSTNAME=pilot-ci.invalid
PILOT_INGRESS_MODE=npm
PILOT_CADDY_PRIVATE_BIND=192.168.50.20:18081
PILOT_NPM_TRUSTED_PROXY_CIDR=192.168.50.10/32
DEPLOYMENT_ENV=pilot
BETTER_AUTH_URL=https://pilot-ci.invalid
BETTER_AUTH_SECRET=fictional-ci-auth-secret-2026-000000000000
KAUL_PERSONNUMMER_KEYRING_HOST_FILE=$KAUL_PERSONNUMMER_KEYRING_FILE
DOCUMENT_STORAGE_HOST_PATH=$WORK_DIRECTORY/documents
POSTGRES_ADMIN_USER=kaul_pilot_admin
POSTGRES_ADMIN_PASSWORD=fictional-ci-admin-secret-2026-000000000
KAUL_DB_USER=kaul_pilot_app
KAUL_DB_PASSWORD=fictional-ci-app-secret-2026-00000000000
KAUL_DB_NAME=kaul_documents_bootstrap
DATABASE_URL=postgresql://kaul_pilot_app:fictional-ci-app-secret-2026-00000000000@postgres:5432/kaul_documents_bootstrap
RESTIC_EXPECTED_VERSION=0.19.1
RESTIC_REPOSITORY=$RESTIC_REPOSITORY
RESTIC_PASSWORD_FILE=$RESTIC_PASSWORD_FILE
EOF
cat > "$WORK_DIRECTORY/ports.yaml" <<'EOF'
services:
  postgres:
    ports:
      - "127.0.0.1::5432"
EOF
# Only isolated PostgreSQL starts. No application image is pulled or run.
compose up -d --wait --wait-timeout 120 postgres
published=$(compose port postgres 5432)
[[ $published =~ ^127\.0\.0\.1:([0-9]+)$ ]] || { printf 'ERROR: Unexpected PostgreSQL binding.\n' >&2; exit 1; }
postgres_port=${BASH_REMATCH[1]}
export KAUL_TEST_ID=ci_backup_documents KAUL_TEST_PORT=3104 DEPLOYMENT_ENV=test NODE_ENV=test
export BETTER_AUTH_URL=http://127.0.0.1:3104 BETTER_AUTH_SECRET=fictional-ci-auth-secret-2026-000000000000
export DATABASE_URL="postgresql://kaul_pilot_admin:fictional-ci-admin-secret-2026-000000000@127.0.0.1:$postgres_port/kaul_test_ci_backup_documents"
export INTEGRATION_DATABASE_URL="$DATABASE_URL"
npm run prisma:generate
npm run test:db:check
npm run test:db:create
# Transfer only the newly guarded database to the normal nonsuperuser role.
# All schema objects are subsequently created by the reviewed Prisma migrations.
compose exec -T postgres psql --username=kaul_pilot_admin --dbname=postgres --set=ON_ERROR_STOP=1 \
  --command='ALTER DATABASE kaul_test_ci_backup_documents OWNER TO kaul_pilot_app;'
export KAUL_CI_APP_DATABASE_URL="postgresql://kaul_pilot_app:fictional-ci-app-secret-2026-00000000000@127.0.0.1:$postgres_port/kaul_test_ci_backup_documents"
export DATABASE_URL="$KAUL_CI_APP_DATABASE_URL" INTEGRATION_DATABASE_URL="$KAUL_CI_APP_DATABASE_URL"
npm run test:db:check
npm run test:db:migrate
sed -i 's/kaul_documents_bootstrap/kaul_test_ci_backup_documents/g' "$KAUL_CI_ENV_FILE"
# Refresh the isolated container's KAUL_DB_NAME too: pg_dump uses that actual
# container environment. Retain the same discovered loopback port and volume.
cat > "$WORK_DIRECTORY/ports.yaml" <<EOF
services:
  postgres:
    ports:
      - "127.0.0.1:$postgres_port:5432"
EOF
compose up -d --no-deps --wait --wait-timeout 120 postgres
[[ $(compose port postgres 5432) = "127.0.0.1:$postgres_port" ]]
node --conditions=react-server --import tsx scripts/pilot-documents-backup-fixture.ts seed
rest-server --append-only --listen 127.0.0.1:18082 --no-auth --path "$WORK_DIRECTORY/repository" > "$WORK_DIRECTORY/rest-server.log" 2>&1 &
REST_SERVER_PID=$!
for _ in $(seq 1 50); do
  if curl --silent --output /dev/null http://127.0.0.1:18082/; then break; fi
  sleep 0.1
done
kill -0 "$REST_SERVER_PID"
restic init >/dev/null
cat > "$WORK_DIRECTORY/bin/docker" <<'EOF'
#!/bin/sh
exec node "$KAUL_CI_REPOSITORY_ROOT/scripts/pilot-documents-rehearsal-docker.mjs" "$@"
EOF
chmod 700 "$WORK_DIRECTORY/bin/docker"
export PATH="$WORK_DIRECTORY/bin:$PATH"
# Real Compose confirms both public services stopped; no running app is simulated.
"$SCRIPT_DIR/pilot-ops.sh" quiesce --env-file "$KAUL_CI_ENV_FILE"
backup_output=$("$SCRIPT_DIR/pilot-ops.sh" backup-documents-set --env-file "$KAUL_CI_ENV_FILE")
manifest_snapshot=$(printf '%s\n' "$backup_output" | sed -n 's/^Documents backup set created and validated: \([0-9a-f]\{64\}\)$/\1/p')
[[ $manifest_snapshot =~ ^[0-9a-f]{64}$ ]]
"$SCRIPT_DIR/pilot-ops.sh" validate-documents-set --env-file "$KAUL_CI_ENV_FILE" --manifest-snapshot "$manifest_snapshot"
"$SCRIPT_DIR/pilot-ops.sh" restore-documents-set --env-file "$KAUL_CI_ENV_FILE" --manifest-snapshot "$manifest_snapshot" \
  --database kaul_restore_ci_backup_documents --storage-root "$KAUL_CI_RESTORE_ROOT"
restic dump "$manifest_snapshot" /kaul-document-backup-set.json > "$WORK_DIRECTORY/manifest.json"
# Permission-level read-only proof as uid 1000; this is not bind-mount proof.
chmod 500 "$KAUL_CI_RESTORE_ROOT" "$KAUL_CI_RESTORE_ROOT/objects" "$KAUL_CI_RESTORE_ROOT/quarantine"
find "$KAUL_CI_RESTORE_ROOT/objects" -type f -exec chmod 400 '{}' +
node --conditions=react-server --import tsx scripts/pilot-documents-backup-fixture.ts verify
node scripts/document-backup-set.mjs verify-metadata "$WORK_DIRECTORY/manifest.json" "$WORK_DIRECTORY/restored-metadata.json"
node scripts/document-backup-set.mjs verify "$WORK_DIRECTORY/manifest.json" "$KAUL_CI_RESTORE_ROOT"
printf 'Documents combined backup/restore rehearsal passed (workspace image-status seam; fictional scanner evidence).\n'