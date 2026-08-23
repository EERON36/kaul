#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE="$REPOSITORY_ROOT/compose.pilot.yaml"
NPM_INGRESS_COMPOSE_FILE="$REPOSITORY_ROOT/compose.pilot.npm.yaml"
PUBLIC_INGRESS_COMPOSE_FILE="$REPOSITORY_ROOT/compose.pilot.public.yaml"
INGRESS_COMPOSE_FILE=
PILOT_CADDY_BIND_IP_VALUE=
PILOT_CADDY_HTTP_PORT_VALUE=
PILOT_NPM_PROXY_IP_VALUE=
ENV_FILE=
SNAPSHOT=
RESTORE_DATABASE=
RESTIC_REPOSITORY_VALUE=
RESTIC_PASSWORD_FILE_VALUE=
RESTIC_EXPECTED_VERSION_VALUE=
RESTIC_STREAM_DIRECTORY=
RESTIC_STREAM_FIFO=
RESTIC_DUMP_PID=
BACKUP_FILENAME=kaul-pilot.dump
PINNED_RESTIC_VERSION=0.19.1
MINIMUM_DATABASE_PASSWORD_LENGTH=32
CARRIAGE_RETURN=$(printf '\r')
OPERATION_LOCK_HELD=false
LOCKED_COMPOSE_PROJECT=
PILOT_COMPOSE_PROJECT=
COMPOSE_INTERPOLATION_KEYS='
COMPOSE_PROJECT_NAME
KAUL_IMAGE
PILOT_HOSTNAME
PILOT_INGRESS_MODE
PILOT_CADDY_PRIVATE_BIND
PILOT_NPM_TRUSTED_PROXY_CIDR
DEPLOYMENT_ENV
BETTER_AUTH_URL
BETTER_AUTH_SECRET
POSTGRES_ADMIN_USER
POSTGRES_ADMIN_PASSWORD
KAUL_DB_USER
KAUL_DB_PASSWORD
KAUL_DB_NAME
DATABASE_URL
'

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

cleanup_temporary_resources() {
  if [ -n "$RESTIC_DUMP_PID" ]; then
    kill "$RESTIC_DUMP_PID" 2>/dev/null || true
    wait "$RESTIC_DUMP_PID" 2>/dev/null || true
    RESTIC_DUMP_PID=
  fi
  if [ -n "$RESTIC_STREAM_FIFO" ]; then
    rm -f -- "$RESTIC_STREAM_FIFO"
    RESTIC_STREAM_FIFO=
  fi
  if [ -n "$RESTIC_STREAM_DIRECTORY" ]; then
    rmdir -- "$RESTIC_STREAM_DIRECTORY" 2>/dev/null || true
    RESTIC_STREAM_DIRECTORY=
  fi
}

trap cleanup_temporary_resources EXIT

note() {
  printf '%s\n' "$*"
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/pilot-ops.sh host-preflight --env-file PATH
  scripts/pilot-ops.sh preflight --env-file PATH
  scripts/pilot-ops.sh backup --env-file PATH
  scripts/pilot-ops.sh validate-backup --env-file PATH --snapshot 64_HEX_CHARACTERS
  scripts/pilot-ops.sh restore --env-file PATH --snapshot 64_HEX_CHARACTERS --database kaul_restore_NAME
  scripts/pilot-ops.sh start-restore-check --env-file PATH --database kaul_restore_NAME
  scripts/pilot-ops.sh stop-restore-check --env-file PATH
  scripts/pilot-ops.sh migrate --env-file PATH
  scripts/pilot-ops.sh update --env-file PATH
  scripts/pilot-ops.sh start-postgres --env-file PATH
  scripts/pilot-ops.sh bootstrap-admin --env-file PATH
  scripts/pilot-ops.sh start-stack --env-file PATH

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
      --snapshot)
        require_option_value "$1" "${2:-}"
        SNAPSHOT=$2
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
  count=0
  value=
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$key="*)
        count=$((count + 1))
        value=${line#*=}
        case "$value" in
          *"$CARRIAGE_RETURN") value=${value%"$CARRIAGE_RETURN"} ;;
        esac
        ;;
    esac
  done < "$ENV_FILE"
  [ "$count" -eq 1 ] || die "$key must occur exactly once in $ENV_FILE."
  printf '%s\n' "$value"
}

run_sanitized_compose() {
  override_mode=$1
  override_value=$2
  shift 2
  KAUL_PILOT_COMPOSE_OVERRIDE_MODE="$override_mode" \
    KAUL_PILOT_COMPOSE_OVERRIDE_VALUE="$override_value" \
    perl -e '
      use strict;
      use warnings;

      my ($keys, @command) = @ARGV;
      my $override_mode = delete($ENV{KAUL_PILOT_COMPOSE_OVERRIDE_MODE}) // q{};
      my $override_value = delete($ENV{KAUL_PILOT_COMPOSE_OVERRIDE_VALUE});
      my @keys = grep { length } split /\s+/, $keys;
      delete @ENV{@keys};

      if ($override_mode eq q{database-url}) {
        defined($override_value) && length($override_value)
          or die "ERROR: Missing trusted Compose database override.\n";
        $ENV{DATABASE_URL} = $override_value;
      } elsif ($override_mode ne q{none}) {
        die "ERROR: Invalid trusted Compose override mode.\n";
      }

      exec @command;
      die "ERROR: Could not start Docker Compose.\n";
    ' "$COMPOSE_INTERPOLATION_KEYS" docker compose \
    --project-name "$PILOT_COMPOSE_PROJECT" \
    --project-directory "$REPOSITORY_ROOT" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    -f "$INGRESS_COMPOSE_FILE" \
    "$@"
}

compose() {
  run_sanitized_compose none '' "$@"
}

compose_with_database_url() {
  database_url_override=$1
  shift
  run_sanitized_compose database-url "$database_url_override" "$@"
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

validate_environment_file() {
  perl -MFcntl=:DEFAULT,:mode -e '
    use strict;
    use warnings;

    my ($path) = @ARGV;
    sysopen(my $file, $path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
      or die "ERROR: The Pilot environment file must be readable and not a symlink.\n";
    my @stat = stat($file);
    S_ISREG($stat[2])
      or die "ERROR: The Pilot environment file must be a regular file.\n";
    $stat[4] == $<
      or die "ERROR: The Pilot environment file must be owned by the current operator.\n";
    if ($^O ne q{msys} && $^O ne q{cygwin}) {
      ($stat[2] & 077) == 0
        or die "ERROR: The Pilot environment file must not grant group or other permissions.\n";
    }
  ' "$ENV_FILE" || exit 1
}

load_compose_project() {
  [ -r "$ENV_FILE" ] || die "A readable --env-file is required."
  command -v awk >/dev/null 2>&1 || die "awk is required."
  command -v perl >/dev/null 2>&1 || die "Perl is required."
  validate_environment_file
  PILOT_COMPOSE_PROJECT=$(environment_value COMPOSE_PROJECT_NAME)
  validate_compose_project_name "$PILOT_COMPOSE_PROJECT"
  if [ -n "$LOCKED_COMPOSE_PROJECT" ] &&
    [ "$PILOT_COMPOSE_PROJECT" != "$LOCKED_COMPOSE_PROJECT" ]; then
    die "COMPOSE_PROJECT_NAME changed while acquiring the Pilot operation lock."
  fi
}

command_requires_operation_lock() {
  case "$1" in
    backup|restore|start-restore-check|stop-restore-check|migrate|update|start-postgres|bootstrap-admin|start-stack) return 0 ;;
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

validate_url_safe_secret() {
  key=$1
  value=$2
  validate_placeholder "$key" "$value"
  [ "${#value}" -ge "$MINIMUM_DATABASE_PASSWORD_LENGTH" ] ||
    die "$key must contain at least $MINIMUM_DATABASE_PASSWORD_LENGTH characters."
  case "$value" in
    *[!A-Za-z0-9._~-]*) die "$key must use URL-safe characters only." ;;
  esac
}

validate_port_binding() {
  key=$1
  value=$2
  case "$value" in
    ""|*[!0-9]*) die "$key must be a numeric host port." ;;
  esac
  [ "$value" -ge 1 ] && [ "$value" -le 65535 ] ||
    die "$key must be between 1 and 65535."
}

validate_ipv4_address() {
  key=$1
  value=$2
  case "$value" in
    ""|*[!0-9.]*) die "$key must be one IPv4 address." ;;
  esac
  previous_ifs=$IFS
  IFS=.
  set -- $value
  IFS=$previous_ifs
  [ "$#" -eq 4 ] || die "$key must be one IPv4 address."
  for octet in "$@"; do
    case "$octet" in
      ""|*[!0-9]*) die "$key must be one IPv4 address." ;;
      0) ;;
      0*) die "$key must use unambiguous IPv4 octets without leading zeroes." ;;
    esac
    [ "$octet" -le 255 ] || die "$key must be one IPv4 address."
  done
}

validate_private_ipv4_address() {
  key=$1
  value=$2
  validate_ipv4_address "$key" "$value"
  previous_ifs=$IFS
  IFS=.
  set -- $value
  IFS=$previous_ifs
  case "$1" in
    10) return ;;
    172)
      [ "$2" -ge 16 ] && [ "$2" -le 31 ] && return
      ;;
    192)
      [ "$2" -eq 168 ] && return
      ;;
  esac
  die "$key must be a private RFC1918 IPv4 address."
}

load_ingress_configuration() {
  ingress_mode=$(environment_value PILOT_INGRESS_MODE)

  case "$ingress_mode" in
    npm)
      INGRESS_COMPOSE_FILE=$NPM_INGRESS_COMPOSE_FILE
      private_bind=$(environment_value PILOT_CADDY_PRIVATE_BIND)
      case "$private_bind" in
        *:*:*) die "PILOT_CADDY_PRIVATE_BIND must contain one private IPv4 address and port." ;;
        *:*)
          PILOT_CADDY_BIND_IP_VALUE=${private_bind%:*}
          PILOT_CADDY_HTTP_PORT_VALUE=${private_bind##*:}
          ;;
        *) die "PILOT_CADDY_PRIVATE_BIND must use PRIVATE_IPV4:PORT format." ;;
      esac
      validate_private_ipv4_address PILOT_CADDY_PRIVATE_BIND "$PILOT_CADDY_BIND_IP_VALUE"
      validate_port_binding PILOT_CADDY_PRIVATE_BIND "$PILOT_CADDY_HTTP_PORT_VALUE"
      [ "$PILOT_CADDY_HTTP_PORT_VALUE" -ge 1024 ] ||
        die "PILOT_CADDY_PRIVATE_BIND must use an unprivileged private-LAN port."
      case "$PILOT_CADDY_HTTP_PORT_VALUE" in
        3000|5432) die "PILOT_CADDY_PRIVATE_BIND must not reuse an application or PostgreSQL port." ;;
      esac
      trusted_proxy_cidr=$(environment_value PILOT_NPM_TRUSTED_PROXY_CIDR)
      case "$trusted_proxy_cidr" in
        */32) PILOT_NPM_PROXY_IP_VALUE=${trusted_proxy_cidr%/32} ;;
        *) die "PILOT_NPM_TRUSTED_PROXY_CIDR must be one exact private IPv4 /32 for NPM." ;;
      esac
      validate_private_ipv4_address PILOT_NPM_TRUSTED_PROXY_CIDR "$PILOT_NPM_PROXY_IP_VALUE"
      [ "$PILOT_NPM_PROXY_IP_VALUE" != "$PILOT_CADDY_BIND_IP_VALUE" ] ||
        die "The NPM proxy address and Kaul VM listener address must differ."
      ;;
    public)
      INGRESS_COMPOSE_FILE=$PUBLIC_INGRESS_COMPOSE_FILE
      ;;
    *) die "PILOT_INGRESS_MODE must be npm or public." ;;
  esac

  [ -r "$INGRESS_COMPOSE_FILE" ] ||
    die "Pilot ingress Compose file not found: $INGRESS_COMPOSE_FILE"
}

validate_snapshot_id() {
  value=$1
  if ! printf '%s\n' "$value" | grep -Eq '^[0-9a-f]{64}$'; then
    die "Snapshot ID must contain exactly 64 lowercase hexadecimal characters."
  fi
}

require_host_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required on the Pilot host."
}

os_release_value() {
  key=$1
  awk -F= -v wanted="$key" '
    $1 == wanted {
      value = substr($0, index($0, "=") + 1)
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
  ' /etc/os-release
}

check_free_kibibytes() {
  path=$1
  label=$2
  available=$(df -Pk "$path" | awk 'NR == 2 { print $4 }')
  case "$available" in
    ""|*[!0-9]*) die "Could not determine free space for $label." ;;
  esac
  [ "$available" -ge 20971520 ] ||
    die "$label must have at least 20 GiB free before Pilot deployment."
}

host_preflight() {
  load_compose_project

  for required_command in awk df docker getconf grep id ip perl realpath restic sed ss systemctl timedatectl uname; do
    require_host_command "$required_command"
  done

  [ "$(uname -s)" = Linux ] || die "The Pilot host must run Linux."
  [ -r /etc/os-release ] || die "The Pilot host must provide /etc/os-release."
  [ "$(os_release_value ID)" = ubuntu ] || die "The Pilot host must run Ubuntu."
  ubuntu_version=$(os_release_value VERSION_ID)
  case "$ubuntu_version" in
    22.04|24.04|26.04) ;;
    *) die "Ubuntu 22.04, 24.04, or 26.04 LTS is required." ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) ;;
    *) die "The reviewed Pilot supply contract currently requires x86-64/amd64." ;;
  esac
  [ "$(id -u)" -ne 0 ] || die "Run Pilot operations as a dedicated non-root operator."

  online_processors=$(getconf _NPROCESSORS_ONLN)
  case "$online_processors" in
    ""|*[!0-9]*) die "Could not determine online processor count." ;;
  esac
  [ "$online_processors" -ge 2 ] || die "The Pilot VM must provide at least 2 vCPUs."

  memory_kibibytes=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
  case "$memory_kibibytes" in
    ""|*[!0-9]*) die "Could not determine host memory." ;;
  esac
  [ "$memory_kibibytes" -ge 4194304 ] || die "The Pilot VM must provide at least 4 GiB RAM."

  check_free_kibibytes "$REPOSITORY_ROOT" "Kaul checkout storage"

  systemctl is-active --quiet docker || die "Docker Engine must be running."
  systemctl is-enabled --quiet docker || die "Docker Engine must start at boot."
  systemctl is-enabled --quiet apt-daily-upgrade.timer ||
    die "Automatic Ubuntu security-update checks must be enabled."
  [ ! -e /var/run/reboot-required ] || die "The Pilot host requires a reboot before deployment."
  [ "$(timedatectl show --property=NTPSynchronized --value)" = yes ] ||
    die "The Pilot host clock must be synchronized."
  docker_data_root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null) ||
    die "The Pilot operator must be able to access Docker without sudo."
  case "$docker_data_root" in
    /*) ;;
    *) die "Docker did not report an absolute data-root directory." ;;
  esac
  [ -d "$docker_data_root" ] || die "Docker's reported data-root directory was not found."
  check_free_kibibytes "$docker_data_root" "Docker data storage"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required."

  actual_restic_version=$(restic version 2>/dev/null | awk 'NR == 1 { print $2 }')
  [ "$actual_restic_version" = "$PINNED_RESTIC_VERSION" ] ||
    die "restic $PINNED_RESTIC_VERSION is required; found ${actual_restic_version:-unknown}."
  perl -MFcntl=:DEFAULT,:flock -e 'exit 0' || die "Perl Fcntl locking support is required."

  ingress_mode=$(environment_value PILOT_INGRESS_MODE)
  [ "$ingress_mode" = npm ] ||
    die "The current Homelab host preflight requires PILOT_INGRESS_MODE=npm."
  load_ingress_configuration
  bind_ip=$PILOT_CADDY_BIND_IP_VALUE
  npm_ip=$PILOT_NPM_PROXY_IP_VALUE
  http_port=$PILOT_CADDY_HTTP_PORT_VALUE

  ip -4 -o address show | awk -v expected="$bind_ip" '
    {
      split($4, address, "/")
      if (address[1] == expected) found = 1
    }
    END { exit found ? 0 : 1 }
  ' || die "PILOT_CADDY_PRIVATE_BIND address is not configured on this host."
  route_to_npm=$(ip -4 route get "$npm_ip" 2>/dev/null) ||
    die "The Pilot host has no IPv4 route to NPM."
  printf '%s\n' "$route_to_npm" | grep -F "src $bind_ip" >/dev/null ||
    die "The NPM route does not use the PILOT_CADDY_PRIVATE_BIND address as its source."
  if ss -H -ltn | awk -v port="$http_port" '$4 ~ (":" port "$") { found = 1 } END { exit found ? 0 : 1 }'; then
    die "PILOT_CADDY_PRIVATE_BIND port is already listening before deployment."
  fi

  note "Automated Ubuntu host preflight passed for the existing VM."
  note "Manual gates remain: Docker-aware firewall proof, restricted SSH, NPM source/header verification, blocked homelab-management access, and reboot persistence rehearsal."
}

validate_restic_password_file() {
  secret_file=$1
  case "$secret_file" in
    /*) ;;
    *) die "RESTIC_PASSWORD_FILE must be an absolute path." ;;
  esac

  perl -MFcntl=:DEFAULT,:mode -e '
    use strict;
    use warnings;

    my ($path) = @ARGV;
    sysopen(my $file, $path, O_RDONLY | O_NOFOLLOW)
      or die "ERROR: RESTIC_PASSWORD_FILE must be a readable regular file and not a symlink.\n";
    my @stat = stat($file);
    S_ISREG($stat[2])
      or die "ERROR: RESTIC_PASSWORD_FILE must be a regular file.\n";
    $stat[4] == $<
      or die "ERROR: RESTIC_PASSWORD_FILE must be owned by the current operator.\n";
    if ($^O ne q{msys} && $^O ne q{cygwin}) {
      ($stat[2] & 077) == 0
        or die "ERROR: RESTIC_PASSWORD_FILE must not grant group or other permissions.\n";
    }
  ' "$secret_file" || exit 1
}

load_restic_configuration() {
  RESTIC_REPOSITORY_VALUE=$(environment_value RESTIC_REPOSITORY)
  RESTIC_PASSWORD_FILE_VALUE=$(environment_value RESTIC_PASSWORD_FILE)
  RESTIC_EXPECTED_VERSION_VALUE=$(environment_value RESTIC_EXPECTED_VERSION)

  validate_placeholder RESTIC_REPOSITORY "$RESTIC_REPOSITORY_VALUE"
  case "$RESTIC_REPOSITORY_VALUE" in
    /*|./*|../*|local:*|[A-Za-z]:*)
      die "RESTIC_REPOSITORY must use an off-host backend, not local storage."
      ;;
    *:*) ;;
    *) die "RESTIC_REPOSITORY must use an explicit remote Restic backend." ;;
  esac
  case "$RESTIC_REPOSITORY_VALUE" in
    rest:http://*:*@*|rest:https://*:*@*)
      die "RESTIC_REPOSITORY must not embed REST credentials; provide them through the service environment."
      ;;
  esac

  [ "$RESTIC_EXPECTED_VERSION_VALUE" = "$PINNED_RESTIC_VERSION" ] ||
    die "RESTIC_EXPECTED_VERSION must be $PINNED_RESTIC_VERSION."
  validate_restic_password_file "$RESTIC_PASSWORD_FILE_VALUE"

  actual_restic_version=$(restic version 2>/dev/null | awk 'NR == 1 { print $2 }')
  [ "$actual_restic_version" = "$PINNED_RESTIC_VERSION" ] ||
    die "restic $PINNED_RESTIC_VERSION is required; found ${actual_restic_version:-unknown}."
}

run_restic() {
  KAUL_PILOT_RESTIC_REPOSITORY_VALUE="$RESTIC_REPOSITORY_VALUE" \
    KAUL_PILOT_RESTIC_PASSWORD_FILE_VALUE="$RESTIC_PASSWORD_FILE_VALUE" \
    perl -e '
      use strict;
      use warnings;

      my $repository = delete($ENV{KAUL_PILOT_RESTIC_REPOSITORY_VALUE});
      my $password_file = delete($ENV{KAUL_PILOT_RESTIC_PASSWORD_FILE_VALUE});
      my %rest_backend_auth;
      for my $key (qw(RESTIC_REST_USERNAME RESTIC_REST_PASSWORD)) {
        $rest_backend_auth{$key} = $ENV{$key} if exists $ENV{$key};
      }
      delete @ENV{grep { /^RESTIC_/ } keys %ENV};
      $ENV{RESTIC_REPOSITORY} = $repository;
      $ENV{RESTIC_PASSWORD_FILE} = $password_file;
      $ENV{$_} = $rest_backend_auth{$_} for keys %rest_backend_auth;
      exec @ARGV;
      die "ERROR: Could not start Restic.\n";
    ' restic "$@"
}

preflight() {
  load_compose_project
  [ -r "$COMPOSE_FILE" ] || die "Pilot Compose file not found: $COMPOSE_FILE"
  command -v docker >/dev/null 2>&1 || die "Docker is required."
  command -v awk >/dev/null 2>&1 || die "awk is required."
  command -v grep >/dev/null 2>&1 || die "grep is required."
  command -v mktemp >/dev/null 2>&1 || die "mktemp is required."
  command -v mkfifo >/dev/null 2>&1 || die "mkfifo is required."
  command -v perl >/dev/null 2>&1 || die "Perl with Fcntl locking support is required."
  command -v realpath >/dev/null 2>&1 || die "realpath is required."
  command -v restic >/dev/null 2>&1 || die "restic $PINNED_RESTIC_VERSION is required."
  command -v sed >/dev/null 2>&1 || die "sed is required."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required."

  deployment_environment=$(environment_value DEPLOYMENT_ENV)
  [ "$deployment_environment" = pilot ] || die "DEPLOYMENT_ENV must be pilot."

  image=$(environment_value KAUL_IMAGE)
  if ! printf '%s\n' "$image" | grep -Eq '^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$'; then
    die "KAUL_IMAGE must be a lowercase ghcr.io image pinned by sha256 digest."
  fi

  hostname=$(environment_value PILOT_HOSTNAME)
  case "$hostname" in
    ""|*://*|*/*|*[!a-z0-9.-]*|.*|*..*|*.)
      die "PILOT_HOSTNAME must be a lowercase hostname without a scheme or path."
      ;;
  esac
  load_ingress_configuration

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
  validate_url_safe_secret BETTER_AUTH_SECRET "$auth_secret"

  admin_user=$(environment_value POSTGRES_ADMIN_USER)
  admin_password=$(environment_value POSTGRES_ADMIN_PASSWORD)
  app_user=$(environment_value KAUL_DB_USER)
  app_password=$(environment_value KAUL_DB_PASSWORD)
  database=$(environment_value KAUL_DB_NAME)
  database_url=$(environment_value DATABASE_URL)

  validate_database_identifier POSTGRES_ADMIN_USER "$admin_user"
  validate_database_identifier KAUL_DB_USER "$app_user"
  validate_database_identifier KAUL_DB_NAME "$database"
  validate_url_safe_secret POSTGRES_ADMIN_PASSWORD "$admin_password"
  validate_url_safe_secret KAUL_DB_PASSWORD "$app_password"
  [ "$admin_user" != "$app_user" ] || die "PostgreSQL administrator and application users must differ."
  [ "$admin_password" != "$app_password" ] || die "PostgreSQL administrator and application passwords must differ."
  [ "$auth_secret" != "$admin_password" ] || die "Authentication and database secrets must differ."
  [ "$auth_secret" != "$app_password" ] || die "Authentication and database secrets must differ."

  case "$database" in
    kaul|postgres|template0|template1) die "Pilot must not use the normal development or system database." ;;
  esac

  expected_database_url="postgresql://$app_user:$app_password@postgres:5432/$database"
  [ "$database_url" = "$expected_database_url" ] || die "DATABASE_URL must use the private postgres service and the dedicated application credentials."

  load_restic_configuration

  compose config --quiet
  note "Pilot preflight passed for $hostname using immutable image $image."
}

validate_snapshot_catalog() {
  snapshot=$1
  validate_snapshot_id "$snapshot"

  snapshot_json=$(run_restic snapshots --json "$snapshot") ||
    die "Restic could not read the requested snapshot catalog entry."
  catalog_ids=$(printf '%s\n' "$snapshot_json" |
    grep -o '"id":"[0-9a-f]\{64\}"' |
    sed 's/^"id":"//; s/"$//')
  [ "$(printf '%s\n' "$catalog_ids" | grep -c .)" -eq 1 ] &&
    [ "$catalog_ids" = "$snapshot" ] ||
    die "Restic catalog did not resolve to exactly the requested snapshot ID."

  listing_json=$(run_restic ls --json "$snapshot") ||
    die "Restic could not list the requested snapshot."
  expected_entries=$(printf '%s\n' "$listing_json" |
    grep -F '"path":"/kaul-pilot.dump"' |
    grep -F '"type":"file"' || true)
  [ "$(printf '%s\n' "$expected_entries" | grep -c .)" -eq 1 ] ||
    die "The requested snapshot must contain exactly one /$BACKUP_FILENAME file."
  printf '%s\n' "$expected_entries" | grep -Eq '"size":[1-9][0-9]*' ||
    die "The requested snapshot contains an empty database archive."
}

stream_snapshot_to_postgres() {
  snapshot=$1
  mode=$2
  database=${3:-}

  umask 077
  RESTIC_STREAM_DIRECTORY=$(mktemp -d)
  RESTIC_STREAM_FIFO="$RESTIC_STREAM_DIRECTORY/database.dump.pipe"
  mkfifo -m 600 "$RESTIC_STREAM_FIFO"

  run_restic dump "$snapshot" "/$BACKUP_FILENAME" > "$RESTIC_STREAM_FIFO" &
  RESTIC_DUMP_PID=$!

  if [ "$mode" = list ]; then
    if compose exec -T postgres sh -ec 'pg_restore --list >/dev/null' < "$RESTIC_STREAM_FIFO"; then
      postgres_status=0
    else
      postgres_status=$?
    fi
  elif [ "$mode" = restore ]; then
    if compose exec -T postgres sh -ec 'pg_restore --username="$KAUL_DB_USER" --dbname="$1" --exit-on-error --single-transaction --no-owner --no-acl' sh "$database" < "$RESTIC_STREAM_FIFO"; then
      postgres_status=0
    else
      postgres_status=$?
    fi
  else
    die "Invalid internal snapshot stream mode."
  fi

  if wait "$RESTIC_DUMP_PID"; then
    restic_status=0
  else
    restic_status=$?
  fi
  RESTIC_DUMP_PID=
  cleanup_temporary_resources

  [ "$restic_status" -eq 0 ] || return "$restic_status"
  [ "$postgres_status" -eq 0 ] || return "$postgres_status"
}

validate_snapshot() {
  snapshot=$1
  validate_snapshot_catalog "$snapshot"
  stream_snapshot_to_postgres "$snapshot" list ||
    die "PostgreSQL could not read the exact Restic snapshot archive."
  note "Exact Restic snapshot and PostgreSQL archive validation passed: $snapshot"
}

validate_restore_database_name() {
  database=$1
  source_database=$(environment_value KAUL_DB_NAME)
  [ "${#database}" -le 63 ] || die "Restore database must contain at most 63 characters."
  case "$database" in
    kaul_restore_*) ;;
    *) die "Restore database must start with kaul_restore_." ;;
  esac
  restore_suffix=${database#kaul_restore_}
  [ -n "$restore_suffix" ] || die "Restore database needs a unique suffix."
  case "$database" in
    *[!a-z0-9_]*) die "Restore database may contain only lowercase letters, digits, and underscores." ;;
  esac
  [ "$database" != "$source_database" ] || die "Restore database must not be the active Pilot database."
}

database_exists() {
  database=$1
  compose exec -T postgres sh -ec 'psql --username="$POSTGRES_USER" --dbname=postgres --tuples-only --no-align --command="SELECT 1 FROM pg_database WHERE datname = '\''$1'\'';"' sh "$database"
}

restore_database_url() {
  database=$1
  source_url=$(environment_value DATABASE_URL)
  printf '%s\n' "${source_url%/*}/$database"
}

create_backup() {
  backup_json=$(run_restic backup \
    --json \
    --quiet \
    --host "$PILOT_COMPOSE_PROJECT" \
    --tag kaul-pilot-database \
    --tag "compose-project-$PILOT_COMPOSE_PROJECT" \
    --stdin-filename "$BACKUP_FILENAME" \
    --stdin-from-command \
    -- \
    perl -e '
      use strict;
      use warnings;

      my ($keys, @command) = @ARGV;
      my @keys = grep { length } split /\s+/, $keys;
      delete @ENV{@keys};
      exec @command;
      die "ERROR: Could not start the PostgreSQL backup command.\n";
    ' "$COMPOSE_INTERPOLATION_KEYS" docker compose \
    --project-name "$PILOT_COMPOSE_PROJECT" \
    --project-directory "$REPOSITORY_ROOT" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    exec -T postgres sh -ec \
    'exec pg_dump --username="$KAUL_DB_USER" --dbname="$KAUL_DB_NAME" --format=custom --no-owner --no-acl') ||
    die "PostgreSQL backup failed; Restic did not publish a successful snapshot."

  snapshot_ids=$(printf '%s\n' "$backup_json" |
    grep -o '"snapshot_id":"[0-9a-f]\{64\}"' |
    sed 's/^"snapshot_id":"//; s/"$//')
  [ "$(printf '%s\n' "$snapshot_ids" | grep -c .)" -eq 1 ] ||
    die "Restic backup succeeded without one unambiguous snapshot ID."
  CREATED_SNAPSHOT=$snapshot_ids
  validate_snapshot "$CREATED_SNAPSHOT"
  note "Backup snapshot created and validated: $CREATED_SNAPSHOT"
}

run_migrations() {
  note "Applying committed Prisma migrations with the selected release image."
  if ! compose run --rm --no-deps kaul npm run db:deploy; then
    die "Migration failed. Kaul remains stopped; preserve logs and restore into a new database before recovery."
  fi
  compose run --rm --no-deps kaul npm run db:status || die "Migration status verification failed. Kaul remains stopped."
}

restore_backup() {
  [ -n "$SNAPSHOT" ] || die "--snapshot is required."
  [ -n "$RESTORE_DATABASE" ] || die "--database is required."
  validate_restore_database_name "$RESTORE_DATABASE"
  validate_snapshot "$SNAPSHOT"

  exists=$(database_exists "$RESTORE_DATABASE")
  [ -z "$exists" ] || die "Restore destination already exists; refusing to overwrite it."

  compose exec -T postgres sh -ec 'createdb --username="$POSTGRES_USER" --owner="$KAUL_DB_USER" --template=template0 "$1"' sh "$RESTORE_DATABASE"
  if ! stream_snapshot_to_postgres "$SNAPSHOT" restore "$RESTORE_DATABASE"; then
    die "Restore failed. The destination was not dropped; preserve it and the logs for review."
  fi

  compose exec -T postgres sh -ec 'psql --username="$KAUL_DB_USER" --dbname="$1" --set=ON_ERROR_STOP=1 --command="SELECT COUNT(*) AS migration_count FROM \"_prisma_migrations\";"' sh "$RESTORE_DATABASE"
  restore_url=$(restore_database_url "$RESTORE_DATABASE")
  compose_with_database_url "$restore_url" run --rm --no-deps kaul npm run db:status
  note "Restore completed into new database: $RESTORE_DATABASE"
  note "The active Pilot database was not changed. Update a controlled verification environment explicitly before starting Kaul against this restore."
}

wait_for_application_health() {
  service=$1
  shift
  container_id=$(compose "$@" ps -q "$service")
  [ -n "$container_id" ] || die "$service container was not created."
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

remove_restore_check_container() {
  compose --profile restore-check rm --force --stop kaul-restore-check
}

start_restore_check() {
  [ -n "$RESTORE_DATABASE" ] || die "--database is required."
  validate_restore_database_name "$RESTORE_DATABASE"
  exists=$(database_exists "$RESTORE_DATABASE")
  [ -n "$exists" ] || die "Restore database does not exist: $RESTORE_DATABASE"

  existing_container=$(compose --profile restore-check ps --all --quiet kaul-restore-check)
  [ -z "$existing_container" ] || die "A private restore check already exists. Stop it before starting another."

  restore_url=$(restore_database_url "$RESTORE_DATABASE")
  compose_with_database_url "$restore_url" --profile restore-check config --quiet
  compose_with_database_url "$restore_url" --profile restore-check run --rm --no-deps kaul-restore-check npm run db:status

  if ! compose_with_database_url "$restore_url" --profile restore-check up -d --no-deps kaul-restore-check; then
    remove_restore_check_container || true
    die "Private restore-check startup failed. The live Kaul and Caddy services were not changed."
  fi
  if ! wait_for_application_health kaul-restore-check --profile restore-check; then
    if ! remove_restore_check_container; then
      die "The private restore check was unhealthy and could not be confirmed removed. The live Kaul and Caddy services were not changed."
    fi
    die "The private restore check was unhealthy and was removed. The live Kaul and Caddy services were not changed."
  fi

  note "Private restore check is healthy against database: $RESTORE_DATABASE"
  note "It has no public route. Stop it with the protected stop-restore-check command and the same environment file."
}

stop_restore_check() {
  existing_container=$(compose --profile restore-check ps --all --quiet kaul-restore-check)
  if [ -z "$existing_container" ]; then
    note "No private restore check exists."
    return
  fi
  remove_restore_check_container || die "The private restore-check container could not be removed."
  note "Private restore-check container removed. Restored databases were preserved."
}

update_application() {
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
  note "Quiesced pre-update backup snapshot: $CREATED_SNAPSHOT"
  run_migrations
  if ! compose up -d --no-deps kaul; then
    if ! compose stop kaul; then
      die "Kaul startup failed, and Kaul could not be confirmed stopped. Caddy remains stopped."
    fi
    die "Kaul startup failed. Kaul and Caddy remain stopped."
  fi
  if ! wait_for_application_health kaul; then
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
  host-preflight)
    host_preflight
    ;;
  preflight)
    preflight
    ;;
  backup)
    preflight
    create_backup
    ;;
  validate-backup)
    preflight
    [ -n "$SNAPSHOT" ] || die "--snapshot is required."
    validate_snapshot "$SNAPSHOT"
    ;;
  restore)
    preflight
    restore_backup
    ;;
  start-restore-check)
    preflight
    start_restore_check
    ;;
  stop-restore-check)
    preflight
    stop_restore_check
    ;;
  migrate)
    preflight
    compose stop kaul
    create_backup
    run_migrations
    note "Migration completed and Kaul remains stopped. Start it deliberately after review."
    ;;
  update)
    preflight
    update_application
    ;;
  start-postgres)
    preflight
    compose up -d postgres
    ;;
  bootstrap-admin)
    preflight
    compose run --rm --no-deps kaul npm run bootstrap:admin
    ;;
  start-stack)
    preflight
    compose up -d
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    die "Unknown command: $COMMAND"
    ;;
esac
