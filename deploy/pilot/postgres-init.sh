#!/bin/sh

set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${KAUL_DB_USER:?KAUL_DB_USER is required}"
: "${KAUL_DB_PASSWORD:?KAUL_DB_PASSWORD is required}"
: "${KAUL_DB_NAME:?KAUL_DB_NAME is required}"

MINIMUM_DATABASE_PASSWORD_LENGTH=32

validate_database_identifier() {
  key=$1
  value=$2
  [ "${#value}" -le 63 ] || {
    printf 'ERROR: %s must contain at most 63 characters.\n' "$key" >&2
    exit 1
  }
  case "$value" in
    *[!a-z0-9_]*)
      printf 'ERROR: %s may contain only lowercase letters, digits, and underscores.\n' "$key" >&2
      exit 1
      ;;
  esac
}

validate_database_password() {
  key=$1
  value=$2
  case "$value" in
    *REPLACE*|*example*|*change-me*|*development-only*)
      printf 'ERROR: %s still contains an example or placeholder value.\n' "$key" >&2
      exit 1
      ;;
  esac
  [ "${#value}" -ge "$MINIMUM_DATABASE_PASSWORD_LENGTH" ] || {
    printf 'ERROR: %s must contain at least %s characters.\n' "$key" "$MINIMUM_DATABASE_PASSWORD_LENGTH" >&2
    exit 1
  }
  case "$value" in
    *[!A-Za-z0-9._~-]*)
      printf 'ERROR: %s must use URL-safe characters only.\n' "$key" >&2
      exit 1
      ;;
  esac
}

validate_database_identifier POSTGRES_USER "$POSTGRES_USER"
validate_database_identifier KAUL_DB_USER "$KAUL_DB_USER"
validate_database_identifier KAUL_DB_NAME "$KAUL_DB_NAME"
validate_database_password POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
validate_database_password KAUL_DB_PASSWORD "$KAUL_DB_PASSWORD"
[ "$POSTGRES_USER" != "$KAUL_DB_USER" ] || {
  printf 'ERROR: PostgreSQL administrator and application users must differ.\n' >&2
  exit 1
}
[ "$POSTGRES_PASSWORD" != "$KAUL_DB_PASSWORD" ] || {
  printf 'ERROR: PostgreSQL administrator and application passwords must differ.\n' >&2
  exit 1
}
case "$KAUL_DB_NAME" in
  kaul|postgres|template0|template1)
    printf 'ERROR: Pilot must not use the normal development or system database.\n' >&2
    exit 1
    ;;
esac

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=app_user="$KAUL_DB_USER" \
  --set=app_password="$KAUL_DB_PASSWORD" \
  --set=app_database="$KAUL_DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'app_database', :'app_user') \gexec
SQL
