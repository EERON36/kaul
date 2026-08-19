#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE=${KAUL_PILOT_COMPOSE_FILE:-"$REPOSITORY_ROOT/compose.pilot.yaml"}
ENV_FILE=
BACKUP_DIRECTORY=
ARCHIVE=
RESTORE_DATABASE=
TEMPORARY_BACKUP=
BACKUP_RESERVATION=
MINIMUM_DATABASE_PASSWORD_LENGTH=32
OPERATION_LOCK_HELD=false
LOCKED_COMPOSE_PROJECT=
PILOT_COMPOSE_PROJECT=

if [ "${1:-}" = "--pilot-operation-lock-held" ]; then
  OPERATION_LOCK_HELD=true
  LOCKED_COMPOSE_PROJECT=${2:-}
  [ -n "$LOCKED_COMPOSE_PROJECT" ] || exit 1
  shift 2
fi

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup_backup_reservation() {
  if [ -n "$BACKUP_RESERVATION" ]; then
    rmdir -- "$BACKUP_RESERVATION" 2>/dev/null || true
    BACKUP_RESERVATION=
  fi
}

trap cleanup_backup_reservation EXIT

note() {
  printf '%s\n' "$*"
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/pilot-ops.sh preflight --env-file PATH
  scripts/pilot-ops.sh backup --env-file PATH --backup-dir PATH
  scripts/pilot-ops.sh validate-backup --env-file PATH --archive PATH
  scripts/pilot-ops.sh restore --env-file PATH --archive PATH --database kaul_restore_NAME
  scripts/pilot-ops.sh migrate --env-file PATH --backup-dir PATH
  scripts/pilot-ops.sh update --env-file PATH --backup-dir PATH

The environment file is parsed as data and is never sourced as shell code.
USAGE
}

require_option_value() {
  option=$1
  value=${2:-}
  [ -n "$value" ] || die "$option requires a value."
}

parse_options() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --env-file)
        require_option_value "$1" "${2:-}"
        ENV_FILE=$2
        shift 2
        ;;
      --backup-dir)
        require_option_value "$1" "${2:-}"
        BACKUP_DIRECTORY=$2
        shift 2
        ;;
      --archive)
        require_option_value "$1" "${2:-}"
        ARCHIVE=$2
        shift 2
        ;;
      --database)
        require_option_value "$1" "${2:-}"
        RESTORE_DATABASE=$2
        shift 2
        ;;
      *) die "Unknown option: $1" ;;
    esac
  done
}

environment_value() {
  key=$1
  count=$(awk -F= -v wanted="$key" '$1 == wanted { count += 1 } END { print count + 0 }' "$ENV_FILE")
  [ "$count" -eq 1 ] || die "$key must occur exactly once in $ENV_FILE."
  awk -F= -v wanted="$key" '$1 == wanted { value = substr($0, index($0, "=") + 1); sub(/\r$/, "", value); print value }' "$ENV_FILE"
}

compose() {
  docker compose \
    --project-name "$PILOT_COMPOSE_PROJECT" \
    --project-directory "$REPOSITORY_ROOT" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

validate_compose_project_name() {
  value=$1
  [ -n "$value" ] || die "COMPOSE_PROJECT_NAME must not be empty."
  [ "${#value}" -le 63 ] ||
    die "COMPOSE_PROJECT_NAME must contain at most 63 characters."
  case "$value" in
    [a-z0-9]*) ;;
    *)
      die "COMPOSE_PROJECT_NAME must start with a lowercase letter or digit."
      ;;
  esac
  case "$value" in
    *[!a-z0-9_-]*)
      die "COMPOSE_PROJECT_NAME may contain only lowercase letters, digits, hyphens, and underscores."
      ;;
  esac
}

load_compose_project() {
  [ -r "$ENV_FILE" ] || die "A readable --env-file is required."
  command -v awk >/dev/null 2>&1 || die "awk is required."
  PILOT_COMPOSE_PROJECT=$(environment_value COMPOSE_PROJECT_NAME)
  validate_compose_project_name "$PILOT_COMPOSE_PROJECT"
  if [ -n "$LOCKED_COMPOSE_PROJECT" ] &&
    [ "$PILOT_COMPOSE_PROJECT" != "$LOCKED_COMPOSE_PROJECT" ]; then
    die "COMPOSE_PROJECT_NAME changed while acquiring the Pilot operation lock."
  fi
}

command_requires_operation_lock() {
  case "$1" in
    backup|restore|migrate|update) return 0 ;;
    *) return 1 ;;
  esac
}

run_with_operation_lock() {
  lock_file="/tmp/kaul-pilot-${PILOT_COMPOSE_PROJECT}.pilot-ops.lock"
  note "Acquiring exclusive Pilot operation lock for Compose project $PILOT_COMPOSE_PROJECT."
  exec perl -MFcntl=:DEFAULT,:flock,:mode,F_SETFD -e '
    use strict;
    use warnings;

    my ($lock_path, @command) = @ARGV;
    sysopen(
      my $lock,
      $lock_path,
      O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW | O_NONBLOCK,
      0600,
    )
      or die "ERROR: Could not open the Pilot operation lock.\n";
    my @lock_stat = stat($lock);
    S_ISREG($lock_stat[2])
      or die "ERROR: Pilot operation lock target is not a regular file.\n";
    $lock_stat[4] == $<
      or die "ERROR: Pilot operation lock is not owned by the current operator.\n";
    flock($lock, LOCK_EX | LOCK_NB)
      or do {
        print STDERR "ERROR: Another Pilot operator workflow is already running.\n";
        exit 1;
      };
    fcntl($lock, F_SETFD, 0)
      or die "ERROR: Could not preserve the Pilot operation lock.\n";
    exec @command;
    die "ERROR: Could not start the locked Pilot operator workflow.\n";
  ' "$lock_file" "$0" --pilot-operation-lock-held "$PILOT_COMPOSE_PROJECT" "$COMMAND" "$@"
}

validate_placeholder() {
  key=$1
  value=$2
  case "$value" in
    *REPLACE*|*example*|*change-me*|*development-only*)
      die "$key still contains an example or placeholder value."
      ;;
  esac
}

validate_database_identifier() {
  key=$1
  value=$2
  [ -n "$value" ] || die "$key must not be empty."
  [ "${#value}" -le 63 ] || die "$key must contain at most 63 characters."
  case "$value" in
    *[!a-z0-9_]*) die "$key may contain only lowercase letters, digits, and underscores." ;;
  esac
}

validate_database_password() {
  key=$1
  value=$2
  validate_placeholder "$key" "$value"
  [ "${#value}" -ge "$MINIMUM_DATABASE_PASSWORD_LENGTH" ] ||
    die "$key must contain at least $MINIMUM_DATABASE_PASSWORD_LENGTH characters."
  case "$value" in
    *[!A-Za-z0-9._~-]*) die "$key must use URL-safe characters only." ;;
  esac
}

preflight() {
  load_compose_project
  [ -r "$COMPOSE_FILE" ] || die "Pilot Compose file not found: $COMPOSE_FILE"
  command -v docker >/dev/null 2>&1 || die "Docker is required."
  command -v awk >/dev/null 2>&1 || die "awk is required."
  command -v grep >/dev/null 2>&1 || die "grep is required."
  command -v mktemp >/dev/null 2>&1 || die "mktemp is required."
  command -v perl >/dev/null 2>&1 || die "Perl with Fcntl locking support is required."
  command -v realpath >/dev/null 2>&1 || die "realpath is required."
  command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required."

  deployment_environment=$(environment_value DEPLOYMENT_ENV)
  [ "$deployment_environment" = pilot ] || die "DEPLOYMENT_ENV must be pilot."

  image=$(environment_value KAUL_IMAGE)
  if ! printf '%s\n' "$image" | grep -Eq '^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$'; then
    die "KAUL_IMAGE must be a lowercase ghcr.io image pinned by sha256 digest."
  fi

  hostname=$(environment_value PILOT_HOSTNAME)
  case "$hostname" in
    ""|*://*|*/*) die "PILOT_HOSTNAME must be a hostname without a scheme or path." ;;
  esac

  auth_url=$(environment_value BETTER_AUTH_URL)
  case "$auth_url" in
    https://*) ;;
    *) die "BETTER_AUTH_URL must use HTTPS for Pilot." ;;
  esac
  auth_authority=${auth_url#https://}
  auth_authority=${auth_authority%%/*}
  auth_hostname=${auth_authority%%:*}
  [ "$auth_hostname" = "$hostname" ] || die "BETTER_AUTH_URL hostname must match PILOT_HOSTNAME."

  auth_secret=$(environment_value BETTER_AUTH_SECRET)
  validate_placeholder BETTER_AUTH_SECRET "$auth_secret"
  [ "${#auth_secret}" -ge 32 ] || die "BETTER_AUTH_SECRET must contain at least 32 characters."

  admin_user=$(environment_value POSTGRES_ADMIN_USER)
  admin_password=$(environment_value POSTGRES_ADMIN_PASSWORD)
  app_user=$(environment_value KAUL_DB_USER)
  app_password=$(environment_value KAUL_DB_PASSWORD)
  database=$(environment_value KAUL_DB_NAME)
  database_url=$(environment_value DATABASE_URL)

  validate_database_identifier POSTGRES_ADMIN_USER "$admin_user"
  validate_database_identifier KAUL_DB_USER "$app_user"
  validate_database_identifier KAUL_DB_NAME "$database"
  validate_database_password POSTGRES_ADMIN_PASSWORD "$admin_password"
  validate_database_password KAUL_DB_PASSWORD "$app_password"
  [ "$admin_user" != "$app_user" ] || die "PostgreSQL administrator and application users must differ."
  [ "$admin_password" != "$app_password" ] || die "PostgreSQL administrator and application passwords must differ."
  [ "$auth_secret" != "$admin_password" ] || die "Authentication and database secrets must differ."
  [ "$auth_secret" != "$app_password" ] || die "Authentication and database secrets must differ."

  case "$database" in
    kaul|postgres|template0|template1) die "Pilot must not use the normal development or system database." ;;
  esac

  expected_database_url="postgresql://$app_user:$app_password@postgres:5432/$database"
  [ "$database_url" = "$expected_database_url" ] || die "DATABASE_URL must use the private postgres service and the dedicated application credentials."

  compose config --quiet
  note "Pilot preflight passed for $hostname using immutable image $image."
}

validate_archive() {
  archive=$1
  [ -f "$archive" ] || die "Backup archive not found: $archive"
  [ -f "$archive.sha256" ] || die "Backup checksum not found: $archive.sha256"
  archive_directory=$(CDPATH= cd -- "$(dirname -- "$archive")" && pwd)
  archive_name=$(basename -- "$archive")
  (cd "$archive_directory" && sha256sum --check --status "$archive_name.sha256") || die "Backup checksum validation failed."
  compose exec -T postgres sh -ec 'pg_restore --list >/dev/null' < "$archive" || die "PostgreSQL could not read the backup archive."
  note "Backup checksum and archive readability passed: $archive"
}

create_backup() {
  [ -n "$BACKUP_DIRECTORY" ] || die "--backup-dir is required."
  mkdir -p -- "$BACKUP_DIRECTORY"
  chmod 700 "$BACKUP_DIRECTORY"
  umask 077
  timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
  database=$(environment_value KAUL_DB_NAME)
  archive="$BACKUP_DIRECTORY/${database}_${timestamp}.dump"
  BACKUP_RESERVATION="$archive.reserve"
  mkdir -- "$BACKUP_RESERVATION" 2>/dev/null || die "Backup destination is already reserved: $archive"
  if [ -e "$archive" ] || [ -e "$archive.sha256" ]; then
    die "Backup destination already exists; refusing to replace it: $archive"
  fi
  TEMPORARY_BACKUP=$(mktemp "$BACKUP_DIRECTORY/.${database}_${timestamp}.dump.partial.XXXXXX")
  compose exec -T postgres sh -ec 'pg_dump --username="$KAUL_DB_USER" --dbname="$KAUL_DB_NAME" --format=custom --no-owner --no-acl' > "$TEMPORARY_BACKUP" || die "PostgreSQL backup failed; partial file retained at $TEMPORARY_BACKUP"
  [ -s "$TEMPORARY_BACKUP" ] || die "PostgreSQL backup produced an empty archive."
  if ! mv -n -- "$TEMPORARY_BACKUP" "$archive"; then
    die "Could not finalize backup; partial file retained at $TEMPORARY_BACKUP"
  fi
  if [ -e "$TEMPORARY_BACKUP" ]; then
    die "Backup destination already exists; refusing to replace it: $archive"
  fi
  TEMPORARY_BACKUP=
  archive_directory=$(CDPATH= cd -- "$(dirname -- "$archive")" && pwd)
  archive_name=$(basename -- "$archive")
  (cd "$archive_directory" && sha256sum "$archive_name" > "$archive_name.sha256")
  validate_archive "$archive"
  cleanup_backup_reservation
  note "Backup created: $archive"
  CREATED_BACKUP=$archive
}

run_migrations() {
  note "Applying committed Prisma migrations with the selected release image."
  if ! compose run --rm --no-deps kaul npm run db:deploy; then
    die "Migration failed. Kaul remains stopped; preserve logs and restore into a new database before recovery."
  fi
  compose run --rm --no-deps kaul npm run db:status || die "Migration status verification failed. Kaul remains stopped."
}

restore_backup() {
  [ -n "$ARCHIVE" ] || die "--archive is required."
  [ -n "$RESTORE_DATABASE" ] || die "--database is required."
  source_database=$(environment_value KAUL_DB_NAME)
  case "$RESTORE_DATABASE" in
    kaul_restore_*) ;;
    *) die "Restore database must start with kaul_restore_." ;;
  esac
  restore_suffix=${RESTORE_DATABASE#kaul_restore_}
  [ -n "$restore_suffix" ] || die "Restore database needs a unique suffix."
  case "$RESTORE_DATABASE" in
    *[!a-z0-9_]*) die "Restore database may contain only lowercase letters, digits, and underscores." ;;
  esac
  [ "$RESTORE_DATABASE" != "$source_database" ] || die "Restore database must not be the active Pilot database."
  validate_archive "$ARCHIVE"

  exists=$(compose exec -T postgres sh -ec 'psql --username="$POSTGRES_USER" --dbname=postgres --tuples-only --no-align --command="SELECT 1 FROM pg_database WHERE datname = '\''$1'\'';"' sh "$RESTORE_DATABASE")
  [ -z "$exists" ] || die "Restore destination already exists; refusing to overwrite it."

  compose exec -T postgres sh -ec 'createdb --username="$POSTGRES_USER" --owner="$KAUL_DB_USER" --template=template0 "$1"' sh "$RESTORE_DATABASE"
  if ! compose exec -T postgres sh -ec 'pg_restore --username="$KAUL_DB_USER" --dbname="$1" --exit-on-error --single-transaction --no-owner --no-acl' sh "$RESTORE_DATABASE" < "$ARCHIVE"; then
    die "Restore failed. The destination was not dropped; preserve it and the logs for review."
  fi

  compose exec -T postgres sh -ec 'psql --username="$KAUL_DB_USER" --dbname="$1" --set=ON_ERROR_STOP=1 --command="SELECT COUNT(*) AS migration_count FROM \"_prisma_migrations\";"' sh "$RESTORE_DATABASE"
  source_url=$(environment_value DATABASE_URL)
  restore_url=${source_url%/*}/$RESTORE_DATABASE
  DATABASE_URL=$restore_url compose run --rm --no-deps kaul npm run db:status
  note "Restore completed into new database: $RESTORE_DATABASE"
  note "The active Pilot database was not changed. Update a controlled verification environment explicitly before starting Kaul against this restore."
}

wait_for_application_health() {
  container_id=$(compose ps -q kaul)
  [ -n "$container_id" ] || die "Kaul container was not created."
  attempts=0
  while [ "$attempts" -lt 45 ]; do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
    case "$status" in
      healthy) note "Kaul container health passed."; return 0 ;;
      unhealthy|exited|dead) return 1 ;;
    esac
    attempts=$((attempts + 1))
    sleep 2
  done
  return 1
}

update_application() {
  [ -n "$BACKUP_DIRECTORY" ] || die "--backup-dir is required."
  current_container=$(compose ps -q kaul 2>/dev/null || true)
  if [ -n "$current_container" ]; then
    current_image=$(docker inspect --format '{{.Config.Image}}' "$current_container")
    note "Current application image: $current_image"
  else
    note "No current Kaul application container was found."
  fi
  target_image=$(environment_value KAUL_IMAGE)
  note "Target application image: $target_image"
  compose pull kaul
  compose stop caddy || die "Caddy could not be stopped. Update did not proceed."
  compose stop kaul || die "Kaul could not be stopped. Caddy remains stopped and update did not proceed."
  create_backup
  note "Quiesced pre-update backup: $CREATED_BACKUP"
  run_migrations
  if ! compose up -d --no-deps kaul; then
    if ! compose stop kaul; then
      die "Kaul startup failed, and Kaul could not be confirmed stopped. Caddy remains stopped."
    fi
    die "Kaul startup failed. Kaul and Caddy remain stopped."
  fi
  if ! wait_for_application_health; then
    if ! compose stop kaul; then
      die "The new application did not become healthy, and Kaul could not be confirmed stopped. Caddy remains stopped."
    fi
    die "The new application did not become healthy and was stopped. Caddy remains stopped. Database rollback requires the documented clean-restore workflow."
  fi
  if ! compose up -d --no-deps caddy; then
    die "Kaul is healthy, but Caddy failed to start. The Pilot remains unavailable."
  fi
  note "Update completed. Verify external HTTPS, login, an allowed workflow, a denied workflow, logs, disk space, and the deployment record."
}

COMMAND=${1:-}
[ -n "$COMMAND" ] || { usage; exit 2; }
shift
parse_options "$@"

if command_requires_operation_lock "$COMMAND" && [ "$OPERATION_LOCK_HELD" != true ]; then
  [ -r "$ENV_FILE" ] || die "A readable --env-file is required."
  command -v realpath >/dev/null 2>&1 || die "realpath is required."
  command -v perl >/dev/null 2>&1 || die "Perl with Fcntl locking support is required."
  ENV_FILE=$(realpath "$ENV_FILE")
  load_compose_project
  run_with_operation_lock "$@"
fi

case "$COMMAND" in
  preflight)
    preflight
    ;;
  backup)
    preflight
    create_backup
    ;;
  validate-backup)
    preflight
    [ -n "$ARCHIVE" ] || die "--archive is required."
    validate_archive "$ARCHIVE"
    ;;
  restore)
    preflight
    restore_backup
    ;;
  migrate)
    preflight
    [ -n "$BACKUP_DIRECTORY" ] || die "--backup-dir is required."
    compose stop kaul
    create_backup
    run_migrations
    note "Migration completed and Kaul remains stopped. Start it deliberately after review."
    ;;
  update)
    preflight
    update_application
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    die "Unknown command: $COMMAND"
    ;;
esac
