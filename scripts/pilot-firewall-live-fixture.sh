#!/usr/bin/env bash

set -Eeuo pipefail

umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

readonly FIXTURE_IMAGE="alpine@sha256:7c8cb692ae09657cbc4a3f3cbd0e8d5a2690ba38386aaaf252dbb060bf5eb2e6"
readonly CONTAINER_NAME="kaul-gate-c-live-validation"
readonly FIXTURE_LIFETIME_SECONDS=480
readonly ROLLBACK_TIMER="kaul-pilot-firewall-rollback.timer"
readonly ROLLBACK_SERVICE="kaul-pilot-firewall-rollback.service"
readonly OPERATOR_PATH="/usr/local/libexec/kaul-pilot-firewall"
readonly EXPECTED_RESPONSE="kaul-gate-c-live-validation"

CONFIG_FILE=/etc/kaul/pilot-firewall.conf
CREATED_CONTAINER_ID=

usage() {
  cat <<'EOF'
Usage:
  pilot-firewall-live-fixture.sh start [--config PATH]
  pilot-firewall-live-fixture.sh status [--config PATH]
  pilot-firewall-live-fixture.sh stop [--config PATH]

This temporary Gate C validation workload is never a Pilot deployment.
EOF
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup_failed_start() {
  local original_status=$?
  trap - EXIT
  if [ "$original_status" -ne 0 ] && [ -n "$CREATED_CONTAINER_ID" ]; then
    docker rm --force "$CREATED_CONTAINER_ID" >/dev/null 2>&1 || true
    if docker inspect "$CREATED_CONTAINER_ID" >/dev/null 2>&1; then
      printf '%s\n' "ERROR: Failed start left the temporary Gate C container behind." >&2
    else
      printf '%s\n' "Failed-start Gate C fixture cleanup verified."
    fi
  fi
  exit "$original_status"
}

parse_options() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --config)
        [ "$#" -ge 2 ] || die "--config requires a path."
        CONFIG_FILE=$2
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *) usage; die "Unknown option: $1" ;;
    esac
  done
  case "$CONFIG_FILE" in
    /*) ;;
    *) die "The Gate C configuration path must be absolute." ;;
  esac
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required."
}

timespan_microseconds() {
  local parsed timespan_output
  timespan_output=$(systemd-analyze timespan "$1") ||
    die "A Gate C timer duration could not be parsed by systemd."
  parsed=$(printf '%s\n' "$timespan_output" |
    awk 'NR == 2 && NF == 2 && $1 == "μs:" && $2 ~ /^[0-9]+$/ { print $2 }')
  case "$parsed" in ''|*[!0-9]*) die "A Gate C timer duration did not produce numeric microseconds." ;; esac
  printf '%s\n' "$parsed"
}

verify_installed_policy() {
  [ -x "$OPERATOR_PATH" ] || die "The installed Gate C firewall operator is required."
  "$OPERATOR_PATH" verify --config "$CONFIG_FILE"
}

load_fixture_values() {
  local parsed
  parsed=$(perl -MFcntl=:DEFAULT,:mode -MSocket=AF_INET,inet_ntop,inet_pton -e '
    use strict;
    use warnings;
    my ($path) = @ARGV;
    sysopen(my $file, $path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
      or die "ERROR: Gate C policy must remain readable and not a symlink.\n";
    my @stat = stat($file);
    S_ISREG($stat[2]) && $stat[4] == 0 && ($stat[2] & 07777) == 0644
      or die "ERROR: Gate C policy must remain root-owned, regular, and mode 0644.\n";
    my %values;
    while (my $line = <$file>) {
      chomp $line;
      next if $line eq q{} || $line =~ /^#/;
      $line =~ /^([A-Z][A-Z0-9_]*)=(.*)$/ or die "ERROR: Invalid Gate C policy line.\n";
      $values{$1} = $2;
    }
    my ($host) = ($values{HOST_IPV4_CIDR} // q{}) =~ /\A([^\/]+)\//;
    defined $host && defined inet_pton(AF_INET, $host) && inet_ntop(AF_INET, inet_pton(AF_INET, $host)) eq $host
      or die "ERROR: Gate C host address is invalid.\n";
    print join("\n", @values{qw(COMPOSE_PROJECT_NAME PUBLISHED_TCP_PORT)}, $host), "\n";
  ' "$CONFIG_FILE") || exit 1
  mapfile -t FIXTURE_VALUES <<< "$parsed"
  [ "${#FIXTURE_VALUES[@]}" -eq 3 ] || die "The fixture policy parser returned an invalid result."
  readonly COMPOSE_PROJECT_NAME=${FIXTURE_VALUES[0]}
  readonly PUBLISHED_TCP_PORT=${FIXTURE_VALUES[1]}
  readonly HOST_IPV4=${FIXTURE_VALUES[2]}
  [ "$COMPOSE_PROJECT_NAME" = kaul-pilot ] ||
    die "The Gate C live fixture is restricted to COMPOSE_PROJECT_NAME=kaul-pilot."
  [ "$HOST_IPV4:$PUBLISHED_TCP_PORT" = 192.168.1.120:8080 ] ||
    die "The Gate C live fixture is restricted to the reviewed 192.168.1.120:8080 binding."
}

require_fresh_rollback_timer() {
  local accuracy_text accuracy_usec active_since earliest_deadline expected_deadline
  local fixed_random_delay latest_deadline
  local last_trigger next_deadline next_deadline_text now_seconds now_microseconds
  local persistent randomized_delay rollback_started timer_age timer_definition
  local timer_substate timer_unit
  [ "$(systemctl is-active "$ROLLBACK_TIMER" 2>/dev/null || true)" = active ] ||
    die "The ten-minute Gate C rollback timer must be active before starting the fixture."
  timer_substate=$(systemctl show --property=SubState --value "$ROLLBACK_TIMER")
  [ "$timer_substate" = waiting ] ||
    die "The newly armed Gate C rollback timer must be waiting."
  last_trigger=$(systemctl show --property=LastTriggerUSecMonotonic --value "$ROLLBACK_TIMER")
  [ "$last_trigger" = 0 ] ||
    die "The Gate C rollback timer has already triggered."
  timer_unit=$(systemctl show --property=Unit --value "$ROLLBACK_TIMER")
  [ "$timer_unit" = "$ROLLBACK_SERVICE" ] ||
    die "The Gate C rollback timer targets an unexpected service."
  randomized_delay=$(systemctl show --property=RandomizedDelayUSec --value "$ROLLBACK_TIMER")
  [ "$randomized_delay" = 0 ] ||
    die "The Gate C rollback timer must not add randomized delay."
  persistent=$(systemctl show --property=Persistent --value "$ROLLBACK_TIMER")
  [ "$persistent" = no ] ||
    die "The Gate C rollback timer must not be persistent."
  fixed_random_delay=$(systemctl show --property=FixedRandomDelay --value "$ROLLBACK_TIMER")
  [ "$fixed_random_delay" = no ] ||
    die "The Gate C rollback timer must not use fixed randomized delay."
  active_since=$(systemctl show --property=ActiveEnterTimestampMonotonic --value "$ROLLBACK_TIMER")
  case "$active_since" in ''|*[!0-9]*) die "Rollback timer activation time is unavailable." ;; esac
  rollback_started=$(systemctl show --property=ExecMainStartTimestampMonotonic --value "$ROLLBACK_SERVICE")
  case "$rollback_started" in
    0) ;;
    ''|*[!0-9]*) die "Rollback service start history is unavailable." ;;
    *) [ "$rollback_started" -lt "$active_since" ] ||
      die "The rollback service ran during or after the current timer activation." ;;
  esac
  timer_definition=$(systemctl cat "$ROLLBACK_TIMER") ||
    die "The effective Gate C rollback timer could not be inspected."
  [ "$(printf '%s\n' "$timer_definition" | grep -E '^OnActiveSec=' | wc -l)" -eq 1 ] &&
    printf '%s\n' "$timer_definition" | grep -Fxq 'OnActiveSec=10min' ||
    die "The effective Gate C rollback timer must have exactly OnActiveSec=10min."
  ! printf '%s\n' "$timer_definition" |
    grep -Eq '^(OnBootSec|OnStartupSec|OnUnitActiveSec|OnUnitInactiveSec|OnCalendar|Persistent)=' ||
    die "The effective Gate C rollback timer contains an unexpected trigger or persistence setting."
  accuracy_text=$(systemctl show --property=AccuracyUSec --value "$ROLLBACK_TIMER")
  accuracy_usec=$(timespan_microseconds "$accuracy_text")
  [ "$accuracy_usec" -eq 1000000 ] ||
    die "The effective Gate C rollback timer must have AccuracyUSec=1s."
  next_deadline_text=$(systemctl show --property=NextElapseUSecMonotonic --value "$ROLLBACK_TIMER")
  next_deadline=$(timespan_microseconds "$next_deadline_text")
  expected_deadline=$((active_since + 600000000))
  earliest_deadline=$((expected_deadline - accuracy_usec))
  latest_deadline=$((expected_deadline + accuracy_usec))
  [ "$next_deadline" -ge "$earliest_deadline" ] &&
    [ "$next_deadline" -le "$latest_deadline" ] ||
    die "The Gate C rollback deadline is not the finite ten-minute deadline for this activation."
  read -r now_seconds _ < /proc/uptime
  now_microseconds=$(awk -v seconds="$now_seconds" 'BEGIN { printf "%.0f", seconds * 1000000 }')
  timer_age=$((now_microseconds - active_since))
  [ "$timer_age" -ge 0 ] && [ "$timer_age" -le 60000000 ] ||
    die "Start the bounded fixture within 60 seconds of arming the rollback timer."
}

require_fixture_port_unpublished() {
  local listener_count tcp_listeners udp_listeners
  tcp_listeners=$(ss -H -ltn) || die "TCP listener state could not be inspected during fixture cleanup."
  udp_listeners=$(ss -H -lun) || die "UDP listener state could not be inspected during fixture cleanup."
  listener_count=$(printf '%s\n%s\n' "$tcp_listeners" "$udp_listeners" |
    awk -v port="$PUBLISHED_TCP_PORT" '
      $4 ~ (":" port "$") { count += 1 }
      END { print count + 0 }
    ') || die "Fixture listener state could not be parsed."
  [ "$listener_count" -eq 0 ] ||
    die "TCP or UDP $PUBLISHED_TCP_PORT is still listening after fixture cleanup."
}

project_resources_absent() {
  local resources
  resources=$(docker ps --all --quiet \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME") ||
    die "Pilot project containers could not be enumerated."
  [ -z "$resources" ] || die "Pilot project containers already exist; the Gate C fixture cannot shadow a deployment."
  resources=$(docker network ls --quiet \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME") ||
    die "Pilot project networks could not be enumerated."
  [ -z "$resources" ] || die "Pilot project networks already exist; the Gate C fixture requires a deployment-free host."
}

validate_fixture_container() {
  docker inspect "$CONTAINER_NAME" |
    KAUL_FIXTURE_IMAGE="$FIXTURE_IMAGE" \
    KAUL_FIXTURE_PROJECT="$COMPOSE_PROJECT_NAME" \
    KAUL_FIXTURE_HOST="$HOST_IPV4" \
    KAUL_FIXTURE_PORT="$PUBLISHED_TCP_PORT" \
    KAUL_FIXTURE_LIFETIME="$FIXTURE_LIFETIME_SECONDS" \
    perl -MJSON::PP -e '
      use strict;
      use warnings;
      local $/;
      my $items = decode_json(<STDIN> // q{});
      @$items == 1 or die "ERROR: Expected exactly one Gate C fixture container.\n";
      my $container = $items->[0];
      my $config = $container->{Config} // {};
      my $host = $container->{HostConfig} // {};
      my $labels = $config->{Labels} // {};
      ($container->{Name} // q{}) eq q{/kaul-gate-c-live-validation}
        or die "ERROR: Gate C fixture name is unexpected.\n";
      ($config->{Image} // q{}) eq $ENV{KAUL_FIXTURE_IMAGE}
        or die "ERROR: Gate C fixture image reference is unexpected.\n";
      ($labels->{q{com.docker.compose.project}} // q{}) eq $ENV{KAUL_FIXTURE_PROJECT} &&
        ($labels->{q{com.docker.compose.service}} // q{}) eq q{caddy} &&
        ($labels->{q{kaul.gate-c.fixture}} // q{}) eq q{true}
        or die "ERROR: Gate C fixture labels are unexpected.\n";
      ($config->{User} // q{}) eq q{65534:65534}
        or die "ERROR: Gate C fixture must run as the non-root nobody user.\n";
      $host->{AutoRemove} && ($host->{RestartPolicy}{Name} // q{}) eq q{no} &&
        $host->{ReadonlyRootfs} && !$host->{PublishAllPorts}
        or die "ERROR: Gate C fixture lifecycle or filesystem protections are unexpected.\n";
      ($host->{NetworkMode} // q{}) eq q{bridge}
        or die "ERROR: Gate C fixture must use the ordinary bridge network.\n";
      ref($container->{Mounts}) eq q{ARRAY} && @{$container->{Mounts}} == 0
        or die "ERROR: Gate C fixture must not use mounts.\n";
      my @cap_drop = @{$host->{CapDrop} // []};
      @cap_drop == 1 && $cap_drop[0] eq q{ALL}
        or die "ERROR: Gate C fixture must drop all capabilities.\n";
      grep { $_ eq q{no-new-privileges:true} } @{$host->{SecurityOpt} // []}
        or die "ERROR: Gate C fixture must set no-new-privileges.\n";
      $host->{Memory} == 33554432 && $host->{MemorySwap} == 33554432 &&
        $host->{NanoCpus} == 250000000 && $host->{PidsLimit} == 16
        or die "ERROR: Gate C fixture resource limits are unexpected.\n";
      my $bindings = $host->{PortBindings}{q{8080/tcp}} // [];
      @$bindings == 1 && ($bindings->[0]{HostIp} // q{}) eq $ENV{KAUL_FIXTURE_HOST} &&
        ($bindings->[0]{HostPort} // q{}) eq $ENV{KAUL_FIXTURE_PORT}
        or die "ERROR: Gate C fixture binding is unexpected.\n";
      my @entrypoint = @{$config->{Entrypoint} // []};
      my @command = @{$config->{Cmd} // []};
      @entrypoint == 1 && $entrypoint[0] eq q{/bin/busybox} &&
        @command >= 2 && $command[0] eq q{timeout} &&
        $command[1] eq $ENV{KAUL_FIXTURE_LIFETIME}
        or die "ERROR: Gate C fixture lifetime command is unexpected.\n";
      $container->{State}{Running}
        or die "ERROR: Gate C fixture is not running.\n";
    ' || exit 1
}

verify_fixture_response() {
  local response
  for _attempt in $(seq 1 30); do
    response=$(docker exec "$CONTAINER_NAME" /bin/busybox wget -qO- \
      http://127.0.0.1:8080/ 2>/dev/null || true)
    [ "$response" = "$EXPECTED_RESPONSE" ] && return
    sleep 0.1
  done
  die "The Gate C fixture did not return its fixed harmless response."
}

start_fixture() {
  verify_installed_policy
  require_fresh_rollback_timer
  project_resources_absent
  docker inspect "$CONTAINER_NAME" >/dev/null 2>&1 &&
    die "The Gate C fixture name already exists."
  trap cleanup_failed_start EXIT
  CREATED_CONTAINER_ID=$(docker run --detach --rm \
    --name "$CONTAINER_NAME" \
    --label "com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
    --label "com.docker.compose.service=caddy" \
    --label "kaul.gate-c.fixture=true" \
    --restart=no \
    --read-only \
    --user 65534:65534 \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --memory 32m \
    --memory-swap 32m \
    --cpus 0.25 \
    --pids-limit 16 \
    --network bridge \
    --publish "$HOST_IPV4:$PUBLISHED_TCP_PORT:8080/tcp" \
    --entrypoint /bin/busybox \
    "$FIXTURE_IMAGE" timeout "$FIXTURE_LIFETIME_SECONDS" /bin/sh -c \
    'while :; do printf "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 27\r\nConnection: close\r\n\r\nkaul-gate-c-live-validation" | /bin/busybox nc -l -p 8080; done') ||
    die "The Gate C fixture could not be started."
  validate_fixture_container
  verify_fixture_response
  verify_installed_policy
  trap - EXIT
  CREATED_CONTAINER_ID=
  printf '%s\n' "Gate C-only fixture started for at most 480 seconds at $HOST_IPV4:$PUBLISHED_TCP_PORT."
  printf '%s\n' "This does not prove NPM-origin access or rejection from an unauthorized LAN host."
}

status_fixture() {
  validate_fixture_container
  verify_fixture_response
  verify_installed_policy
  printf '%s\n' "Gate C-only fixture is running with the exact bounded contract at $HOST_IPV4:$PUBLISHED_TCP_PORT."
}

stop_fixture() {
  if ! docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    verify_installed_policy
    require_fixture_port_unpublished
    printf '%s\n' "Gate C fixture is absent; cleanup verification passed."
    return
  fi
  validate_fixture_container
  docker stop --time 5 "$CONTAINER_NAME" >/dev/null ||
    die "The Gate C fixture could not be stopped."
  for _attempt in $(seq 1 50); do
    docker inspect "$CONTAINER_NAME" >/dev/null 2>&1 || break
    sleep 0.1
  done
  docker inspect "$CONTAINER_NAME" >/dev/null 2>&1 &&
    die "The Gate C fixture remains after stop."
  project_resources_absent
  verify_installed_policy
  require_fixture_port_unpublished
  printf '%s\n' "Gate C fixture stopped; container, listener, and target DNAT cleanup verified."
}

COMMAND=${1:-}
[ -n "$COMMAND" ] || { usage; exit 2; }
shift
parse_options "$@"
case "$COMMAND" in start|status|stop) ;; -h|--help|help) usage; exit 0 ;; *) usage; die "Unknown command: $COMMAND" ;; esac
[ "$(id -u)" -eq 0 ] || die "The Gate C live fixture must run as root."
for required_command in awk docker grep perl seq sleep ss systemctl systemd-analyze wc; do
  require_command "$required_command"
done
load_fixture_values
case "$COMMAND" in
  start) start_fixture ;;
  status) status_fixture ;;
  stop) stop_fixture ;;
esac
