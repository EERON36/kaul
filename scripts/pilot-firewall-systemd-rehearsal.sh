#!/usr/bin/env bash

set -Eeuo pipefail

[ "$(id -u)" -eq 0 ] || {
  printf '%s\n' "ERROR: The disposable systemd rehearsal must run as root." >&2
  exit 1
}
for required_command in pgrep systemctl systemd-analyze timeout; do
  command -v "$required_command" >/dev/null 2>&1 || {
    printf 'ERROR: %s is required.\n' "$required_command" >&2
    exit 1
  }
done

RUN_ID=${GITHUB_RUN_ID:-local}
case "$RUN_ID" in
  ''|*[!A-Za-z0-9_-]*)
    printf '%s\n' "ERROR: GITHUB_RUN_ID contains unsafe path characters." >&2
    exit 1
    ;;
esac
readonly SUFFIX="${RUN_ID}-$$"
readonly UNIT="kaul-firewall-systemd-rehearsal-${SUFFIX}"
readonly SERVICE="${UNIT}.service"
readonly SOCKET="${UNIT}.socket"
readonly FIREWALL_SERVICE="${UNIT}-ufw.service"
readonly ROLLBACK_SERVICE="${UNIT}-rollback.service"
readonly ROLLBACK_TIMER="${UNIT}-rollback.timer"
readonly LOAD_ANCHOR="${UNIT}-load-anchor.target"
readonly WORK_DIRECTORY="/run/${UNIT}"
readonly UNIT_DIRECTORY="/run/systemd/system"
readonly SERVICE_PATH="${UNIT_DIRECTORY}/${SERVICE}"
readonly SOCKET_PATH="${UNIT_DIRECTORY}/${SOCKET}"
readonly FIREWALL_PATH="${UNIT_DIRECTORY}/${FIREWALL_SERVICE}"
readonly ROLLBACK_PATH="${UNIT_DIRECTORY}/${ROLLBACK_SERVICE}"
readonly TIMER_PATH="${UNIT_DIRECTORY}/${ROLLBACK_TIMER}"
readonly LOAD_ANCHOR_PATH="${UNIT_DIRECTORY}/${LOAD_ANCHOR}"
readonly DROP_IN_DIRECTORY="${UNIT_DIRECTORY}/${SERVICE}.d"
readonly DROP_IN_PATH="${DROP_IN_DIRECTORY}/20-kaul-pilot-firewall.conf"
readonly HELPER_PATH="${WORK_DIRECTORY}/helper"
readonly SOCKET_PATHNAME="${WORK_DIRECTORY}/activation.sock"

cleanup() {
  local original_status=$?
  trap - EXIT
  set +e
  case "$WORK_DIRECTORY" in
    /run/kaul-firewall-systemd-rehearsal-*) ;;
    *) printf '%s\n' "ERROR: Unsafe systemd rehearsal cleanup path." >&2; exit 2 ;;
  esac
  systemctl stop "$LOAD_ANCHOR" "$ROLLBACK_TIMER" "$ROLLBACK_SERVICE" \
    "$SOCKET" "$SERVICE" "$FIREWALL_SERVICE" >/dev/null 2>&1
  systemctl reset-failed "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER" "$SOCKET" \
    "$SERVICE" "$FIREWALL_SERVICE" "$LOAD_ANCHOR" >/dev/null 2>&1
  rm -f -- "$SERVICE_PATH" "$SOCKET_PATH" "$FIREWALL_PATH" \
    "$ROLLBACK_PATH" "$TIMER_PATH" "$LOAD_ANCHOR_PATH" "$DROP_IN_PATH"
  rmdir -- "$DROP_IN_DIRECTORY" >/dev/null 2>&1 || true
  rm -rf -- "$WORK_DIRECTORY"
  systemctl daemon-reload >/dev/null 2>&1
  if systemctl cat "$SERVICE" >/dev/null 2>&1 ||
    systemctl cat "$SOCKET" >/dev/null 2>&1 ||
    systemctl cat "$FIREWALL_SERVICE" >/dev/null 2>&1 ||
    systemctl cat "$ROLLBACK_SERVICE" >/dev/null 2>&1 ||
    systemctl cat "$ROLLBACK_TIMER" >/dev/null 2>&1 ||
    systemctl cat "$LOAD_ANCHOR" >/dev/null 2>&1 ||
    [ -e "$WORK_DIRECTORY" ]; then
    printf '%s\n' "ERROR: Disposable systemd rehearsal cleanup could not be verified." >&2
    [ "$original_status" -ne 0 ] || original_status=2
  else
    printf '%s\n' "Disposable systemd firewall lifecycle cleanup verified."
  fi
  exit "$original_status"
}
trap cleanup EXIT

pin_units_for_reuse() {
  local anchor_state unit unit_load_state

  [ "$#" -gt 0 ] || {
    printf '%s\n' "ERROR: No disposable units were supplied for pinning." >&2
    exit 1
  }
  systemctl daemon-reload
  systemctl start "$LOAD_ANCHOR"
  anchor_state=$(systemctl show --property=ActiveState --value "$LOAD_ANCHOR") || {
    printf '%s\n' "ERROR: Disposable load anchor state could not be inspected." >&2
    exit 1
  }
  [ "$anchor_state" = active ] || {
    printf 'ERROR: Disposable load anchor is %s instead of active.\n' \
      "$anchor_state" >&2
    exit 1
  }
  for unit in "$@"; do
    unit_load_state=$(systemctl show --property=LoadState --value "$unit") || {
      printf 'ERROR: Load state could not be inspected for %s.\n' "$unit" >&2
      exit 1
    }
    [ "$unit_load_state" = loaded ] || {
      printf 'ERROR: Disposable unit %s has load state %s.\n' \
        "$unit" "$unit_load_state" >&2
      exit 1
    }
  done
}

release_load_anchor() {
  local anchor_state

  systemctl stop "$LOAD_ANCHOR"
  anchor_state=$(systemctl show --property=ActiveState --value "$LOAD_ANCHOR") || {
    printf '%s\n' "ERROR: Disposable load anchor state could not be inspected." >&2
    exit 1
  }
  [ "$anchor_state" = inactive ] || {
    printf 'ERROR: Disposable load anchor remained %s.\n' "$anchor_state" >&2
    exit 1
  }
}

prepare_units_for_reuse() {
  local expected_state index unit unit_active_state
  local -a expected_states=() failed_units=() units=()

  [ "$#" -gt 0 ] && [ $(( $# % 2 )) -eq 0 ] || {
    printf '%s\n' "ERROR: Disposable reuse requires unit/state pairs." >&2
    exit 1
  }
  while [ "$#" -gt 0 ]; do
    unit=$1
    expected_state=$2
    case "$expected_state" in
      failed|inactive|inactive-or-failed) ;;
      *)
        printf 'ERROR: Unsupported expected state %s for %s.\n' \
          "$expected_state" "$unit" >&2
        exit 1
        ;;
    esac
    units+=("$unit")
    expected_states+=("$expected_state")
    shift 2
  done

  pin_units_for_reuse "${units[@]}"
  for index in "${!units[@]}"; do
    unit=${units[$index]}
    expected_state=${expected_states[$index]}
    unit_active_state=$(systemctl show --property=ActiveState --value "$unit") || {
      printf 'ERROR: Active state could not be inspected for %s.\n' "$unit" >&2
      exit 1
    }
    case "$expected_state:$unit_active_state" in
      failed:failed|inactive:inactive|inactive-or-failed:failed|inactive-or-failed:inactive) ;;
      *)
        printf 'ERROR: Disposable unit %s is %s; expected %s before reuse.\n' \
          "$unit" "$unit_active_state" "$expected_state" >&2
        exit 1
        ;;
    esac
    [ "$unit_active_state" != failed ] || failed_units+=("$unit")
  done

  if [ "${#failed_units[@]}" -gt 0 ]; then
    systemctl reset-failed "${failed_units[@]}"
  fi
  for unit in "${units[@]}"; do
    unit_active_state=$(systemctl show --property=ActiveState --value "$unit") || {
      printf 'ERROR: Post-reset state could not be inspected for %s.\n' "$unit" >&2
      exit 1
    }
    [ "$unit_active_state" = inactive ] || {
      printf 'ERROR: Disposable unit %s remained %s after strict reset.\n' \
        "$unit" "$unit_active_state" >&2
      exit 1
    }
  done

  release_load_anchor
  wait_for_units_unloaded "${units[@]}"
  pin_units_for_reuse "${units[@]}"
  for unit in "${units[@]}"; do
    unit_active_state=$(systemctl show --property=ActiveState --value "$unit") || {
      printf 'ERROR: Reloaded state could not be inspected for %s.\n' "$unit" >&2
      exit 1
    }
    [ "$unit_active_state" = inactive ] || {
      printf 'ERROR: Reloaded disposable unit %s is %s instead of inactive.\n' \
        "$unit" "$unit_active_state" >&2
      exit 1
    }
  done
}

wait_for_units_unloaded() {
  local all_unloaded unit unit_listing

  [ "$#" -gt 0 ] || {
    printf '%s\n' "ERROR: No disposable units were supplied for unload proof." >&2
    exit 1
  }
  for _attempt in $(seq 1 50); do
    all_unloaded=yes
    for unit in "$@"; do
      unit_listing=$(systemctl list-units --all --full --no-legend "$unit") || {
        printf 'ERROR: Loaded-unit state could not be inspected for %s.\n' \
          "$unit" >&2
        exit 1
      }
      [ -z "$unit_listing" ] || all_unloaded=no
    done
    [ "$all_unloaded" = yes ] && return
    sleep 0.1
  done
  printf 'ERROR: Disposable units did not become unloaded: %s.\n' "$*" >&2
  exit 1
}

wait_for_stopped_units() {
  local expected_service_state=$1 service_state socket_state unit_jobs

  case "$expected_service_state" in
    failed|inactive) ;;
    *)
      printf 'ERROR: Unsupported settled service state: %s.\n' \
        "$expected_service_state" >&2
      exit 1
      ;;
  esac
  for _attempt in $(seq 1 50); do
    service_state=$(systemctl is-active "$SERVICE" 2>/dev/null || true)
    socket_state=$(systemctl is-active "$SOCKET" 2>/dev/null || true)
    unit_jobs=$(systemctl list-jobs --no-legend --no-pager "$SERVICE" "$SOCKET") || {
      printf '%s\n' "ERROR: Disposable service/socket jobs could not be inspected." >&2
      exit 1
    }
    if [ "$service_state" = "$expected_service_state" ] &&
      [ "$socket_state" = inactive ] &&
      [ -z "$unit_jobs" ]; then
      return
    fi
    sleep 0.1
  done
  printf 'ERROR: Disposable service/socket did not settle as expected (expected service=%s, service=%s, socket=%s).\n' \
    "$expected_service_state" "$service_state" "$socket_state" >&2
  exit 1
}

assert_rollback_settled() {
  local rollback_jobs rollback_state
  wait_for_stopped_units inactive
  rollback_state=$(systemctl is-active "$ROLLBACK_SERVICE" 2>/dev/null || true)
  [ "$rollback_state" = inactive ] || {
    printf 'ERROR: Rollback service remained %s.\n' "$rollback_state" >&2
    exit 1
  }
  rollback_jobs=$(systemctl list-jobs --no-legend --no-pager \
    "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER" "$SERVICE" "$SOCKET") || {
    printf '%s\n' "ERROR: Disposable rollback jobs could not be inspected." >&2
    exit 1
  }
  [ -z "$rollback_jobs" ] || {
    printf '%s\n' "ERROR: A disposable rollback job remained queued or running." >&2
    exit 1
  }
  assert_process_pattern_absent "$HELPER_PATH" \
    "A disposable rollback helper process remained."
  assert_process_pattern_absent "systemctl.*$UNIT" \
    "A unit-specific systemctl process remained after rollback."
  [ ! -e "$WORK_DIRECTORY/exposure" ] || {
    printf '%s\n' "ERROR: Rollback left a simulated publication." >&2
    exit 1
  }
  [ ! -e "$WORK_DIRECTORY/guard" ] || {
    printf '%s\n' "ERROR: Rollback left the simulated firewall guard." >&2
    exit 1
  }
}

assert_process_pattern_absent() {
  local error_message=$2 process_status
  if pgrep -af -- "$1" >/dev/null 2>&1; then
    printf 'ERROR: %s\n' "$error_message" >&2
    exit 1
  else
    process_status=$?
  fi
  [ "$process_status" -eq 1 ] || {
    printf 'ERROR: Process state could not be inspected while checking: %s\n' \
      "$error_message" >&2
    exit 1
  }
}

assert_fresh_timer_history() {
  local active_since last_trigger rollback_started timer_substate
  [ "$(systemctl is-active "$ROLLBACK_TIMER" 2>/dev/null || true)" = active ] || {
    printf '%s\n' "ERROR: Disposable rollback timer is not active after re-arm." >&2
    exit 1
  }
  timer_substate=$(systemctl show --property=SubState --value "$ROLLBACK_TIMER") || {
    printf '%s\n' "ERROR: Disposable rollback timer substate could not be inspected." >&2
    exit 1
  }
  [ "$timer_substate" = waiting ] || {
    printf 'ERROR: Disposable rollback timer is %s instead of waiting.\n' "$timer_substate" >&2
    exit 1
  }
  last_trigger=$(systemctl show --property=LastTriggerUSecMonotonic --value \
    "$ROLLBACK_TIMER") || {
    printf '%s\n' "ERROR: Disposable rollback timer trigger history could not be inspected." >&2
    exit 1
  }
  [ "$last_trigger" = 0 ] || {
    printf '%s\n' "ERROR: Re-armed disposable rollback timer retained trigger history." >&2
    exit 1
  }
  active_since=$(systemctl show --property=ActiveEnterTimestampMonotonic --value \
    "$ROLLBACK_TIMER") || exit 1
  rollback_started=$(systemctl show --property=ExecMainStartTimestampMonotonic --value \
    "$ROLLBACK_SERVICE") || exit 1
  case "$active_since:$rollback_started" in
    *[!0-9:]*|:*|*:) printf '%s\n' "ERROR: Disposable timer/service monotonic history is malformed." >&2; exit 1 ;;
    *:0) ;;
    *) [ "$rollback_started" -lt "$active_since" ] || {
      printf '%s\n' "ERROR: Historical rollback is not older than the re-armed timer." >&2
      exit 1
    } ;;
  esac
}

stop_rollback_timer_strictly() {
  local timer_state

  systemctl stop "$ROLLBACK_TIMER"
  timer_state=$(systemctl is-active "$ROLLBACK_TIMER" 2>/dev/null || true)
  [ "$timer_state" = inactive ] || {
    printf 'ERROR: Disposable rollback timer remained %s after stop.\n' \
      "$timer_state" >&2
    exit 1
  }
}

cancel_rollback_timer_race_safely() {
  local rollback_jobs rollback_state

  stop_rollback_timer_strictly
  for _attempt in $(seq 1 50); do
    rollback_state=$(systemctl show --property=ActiveState --value \
      "$ROLLBACK_SERVICE") || exit 1
    rollback_jobs=$(systemctl list-jobs --no-legend --no-pager \
      "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER") || {
      printf '%s\n' "ERROR: Cancellation-race jobs could not be inspected." >&2
      exit 1
    }
    case "$rollback_state" in
      inactive) [ -z "$rollback_jobs" ] && return ;;
      failed)
        printf '%s\n' "ERROR: Disposable rollback service failed during timer cancellation." >&2
        exit 1
        ;;
    esac
    sleep 0.1
  done
  printf '%s\n' "ERROR: Disposable rollback cancellation did not settle race-safely." >&2
  exit 1
}

start_protected_service() {
  local expected_service_state=${1:-inactive}

  prepare_units_for_reuse "$SERVICE" "$expected_service_state" \
    "$SOCKET" inactive
  systemctl start "$SOCKET"
  systemctl start "$SERVICE"
  systemctl is-active --quiet "$SERVICE" || {
    printf '%s\n' "ERROR: Protected disposable service did not become active." >&2
    exit 1
  }
  [ -e "$WORK_DIRECTORY/exposure" ] && [ -e "$WORK_DIRECTORY/guard" ] || {
    printf '%s\n' "ERROR: Protected disposable service did not create its simulated state." >&2
    exit 1
  }
  release_load_anchor
}

install -d -m 0700 "$WORK_DIRECTORY"
cat > "$HELPER_PATH" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
case "\${1:-}" in
  preflight)
    [ ! -e "$WORK_DIRECTORY/exposure" ]
    systemctl is-active --quiet "$FIREWALL_SERVICE"
    printf '%s\n' preflight >> "$WORK_DIRECTORY/events"
    ;;
  apply)
    : > "$WORK_DIRECTORY/guard"
    printf '%s\n' apply >> "$WORK_DIRECTORY/events"
    ;;
  verify)
    [ -e "$WORK_DIRECTORY/guard" ]
    if [ -e "$WORK_DIRECTORY/verify-failure" ]; then
      printf '%s\n' verify-failed >> "$WORK_DIRECTORY/events"
      exit 1
    fi
    printf '%s\n' verify >> "$WORK_DIRECTORY/events"
    ;;
  fail-closed)
    socket_state=\$(systemctl is-active "$SOCKET" 2>/dev/null || true)
    case "\$socket_state" in
      inactive|failed) socket_outcome=stopped ;;
      active|activating|deactivating|reloading)
        systemctl --no-block stop "$SOCKET"
        socket_state=\$(systemctl is-active "$SOCKET" 2>/dev/null || true)
        case "\$socket_state" in
          inactive|failed) socket_outcome=stopped ;;
          active|activating|deactivating|reloading) socket_outcome=accepted ;;
          *) exit 1 ;;
        esac
        ;;
      *) exit 1 ;;
    esac
    rm -f -- "$WORK_DIRECTORY/exposure"
    [ -e "$WORK_DIRECTORY/guard" ]
    printf 'fail-closed-%s\n' "\$socket_outcome" >> "$WORK_DIRECTORY/events"
    ;;
  rollback)
    systemctl stop "$SOCKET"
    [ "\$(systemctl is-active "$SOCKET" 2>/dev/null || true)" = inactive ]
    systemctl stop "$SERVICE"
    service_state=\$(systemctl is-active "$SERVICE" 2>/dev/null || true)
    socket_state=\$(systemctl is-active "$SOCKET" 2>/dev/null || true)
    case "\$service_state" in inactive|failed) ;; *) exit 1 ;; esac
    [ "\$socket_state" = inactive ]
    [ ! -e "$WORK_DIRECTORY/exposure" ]
    rm -f -- "$WORK_DIRECTORY/guard"
    printf '%s\n' rollback >> "$WORK_DIRECTORY/events"
    ;;
  *) exit 2 ;;
esac
EOF
chmod 0755 "$HELPER_PATH"

cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=Disposable Docker bootstrap rehearsal
Requires=$SOCKET
After=$SOCKET

[Service]
Type=simple
Restart=no
ExecStart=/bin/bash -c 'touch "$WORK_DIRECTORY/exposure"; exec sleep infinity'
ExecStop=/bin/rm -f "$WORK_DIRECTORY/exposure"
EOF

cat > "$FIREWALL_PATH" <<EOF
[Unit]
Description=Disposable UFW dependency rehearsal

[Service]
Type=oneshot
ExecStart=/usr/bin/test -e "$WORK_DIRECTORY/ufw-active"
RemainAfterExit=yes
EOF

cat > "$SOCKET_PATH" <<EOF
[Unit]
Description=Disposable Kaul firewall socket-activation rehearsal

[Socket]
ListenStream=$SOCKET_PATHNAME
Service=$SERVICE
EOF

cat > "$ROLLBACK_PATH" <<EOF
[Unit]
Description=Disposable explicit and timed rollback rehearsal

[Service]
Type=oneshot
ExecStart=$HELPER_PATH rollback
EOF

cat > "$TIMER_PATH" <<EOF
[Unit]
Description=Disposable timed rollback rehearsal

[Timer]
OnActiveSec=30s
AccuracySec=100ms
Unit=$ROLLBACK_SERVICE
EOF

cat > "$LOAD_ANCHOR_PATH" <<EOF
[Unit]
Description=Disposable unit load anchor for lifecycle rehearsal
After=$SERVICE $SOCKET $FIREWALL_SERVICE $ROLLBACK_SERVICE $ROLLBACK_TIMER
EOF

systemd-analyze verify "$SERVICE_PATH" "$SOCKET_PATH" "$FIREWALL_PATH" \
  "$ROLLBACK_PATH" "$TIMER_PATH" "$LOAD_ANCHOR_PATH"
systemctl daemon-reload

# First installation: stop the already-running base service before guard hooks.
systemctl start "$SERVICE"
for _attempt in $(seq 1 30); do
  if [ -e "$WORK_DIRECTORY/exposure" ] && systemctl is-active --quiet "$SERVICE"; then
    break
  fi
  sleep 0.1
done
systemctl is-active --quiet "$SERVICE" || {
  printf '%s\n' "ERROR: Disposable bootstrap service did not become active." >&2
  exit 1
}
[ -e "$WORK_DIRECTORY/exposure" ] || {
  printf '%s\n' "ERROR: Disposable bootstrap service did not create its simulated publication." >&2
  exit 1
}
systemctl stop "$SERVICE"
[ ! -e "$WORK_DIRECTORY/exposure" ] || {
  printf '%s\n' "ERROR: Bootstrap stop left a simulated publication." >&2
  exit 1
}

install -d -m 0755 "$DROP_IN_DIRECTORY"
cat > "$DROP_IN_PATH" <<EOF
[Unit]
Requires=$FIREWALL_SERVICE
After=$FIREWALL_SERVICE

[Service]
ExecStartPre=$HELPER_PATH preflight
ExecStartPre=$HELPER_PATH apply
ExecStartPost=$HELPER_PATH verify
ExecStopPost=$HELPER_PATH fail-closed
EOF
systemd-analyze verify "$SERVICE_PATH" "$SOCKET_PATH" "$FIREWALL_PATH" \
  "$ROLLBACK_PATH" "$TIMER_PATH" "$LOAD_ANCHOR_PATH"
systemctl daemon-reload
systemctl start "$SOCKET"

# Preserve the pre-start dependency and post-start fail-closed coverage.
if systemctl start "$SERVICE"; then
  printf '%s\n' "ERROR: Service started while its UFW dependency failed." >&2
  exit 1
fi
[ ! -e "$WORK_DIRECTORY/exposure" ] || {
  printf '%s\n' "ERROR: Failed UFW dependency allowed a simulated publication." >&2
  exit 1
}
systemctl stop "$SOCKET"
[ "$(systemctl is-active "$SOCKET" 2>/dev/null || true)" = inactive ] || {
  printf '%s\n' "ERROR: Dependency-failure socket did not become inactive." >&2
  exit 1
}
rm -f -- "$WORK_DIRECTORY/events" "$WORK_DIRECTORY/guard"
prepare_units_for_reuse "$SERVICE" inactive-or-failed \
  "$FIREWALL_SERVICE" failed "$SOCKET" inactive
touch "$WORK_DIRECTORY/ufw-active" "$WORK_DIRECTORY/verify-failure"
systemctl start "$FIREWALL_SERVICE"
systemctl start "$SOCKET"
if systemctl start "$SERVICE"; then
  printf '%s\n' "ERROR: Intentional post-start verification failure was accepted." >&2
  exit 1
fi
wait_for_stopped_units failed
[ ! -e "$WORK_DIRECTORY/exposure" ] && [ -e "$WORK_DIRECTORY/guard" ] || {
  printf '%s\n' "ERROR: Post-start failure did not remove publication and retain protection." >&2
  exit 1
}
post_start_events=$(cat "$WORK_DIRECTORY/events")
case "$post_start_events" in
  $'preflight\napply\nverify-failed\nfail-closed-accepted') ;;
  $'preflight\napply\nverify-failed\nfail-closed-stopped') ;;
  *)
    printf '%s\n' "ERROR: systemd did not execute the exact post-start firewall lifecycle order." >&2
    exit 1
    ;;
esac

# Reproduce explicit rollback: request socket shutdown first, then let systemd
# perform inverse dependency stop ordering before final inactivity proof.
rm -f -- "$WORK_DIRECTORY/verify-failure"
start_protected_service failed
prepare_units_for_reuse "$ROLLBACK_SERVICE" inactive
timeout 10 systemctl start "$ROLLBACK_SERVICE"
assert_rollback_settled
explicit_count=$(grep -c '^rollback$' "$WORK_DIRECTORY/events")
[ "$explicit_count" -eq 1 ] || {
  printf '%s\n' "ERROR: Explicit rollback did not complete exactly once." >&2
  exit 1
}
release_load_anchor
wait_for_units_unloaded "$ROLLBACK_SERVICE" "$SERVICE" "$SOCKET"

# The same explicit operation remains safe and bounded when already rolled back.
prepare_units_for_reuse "$ROLLBACK_SERVICE" inactive
timeout 10 systemctl start "$ROLLBACK_SERVICE"
assert_rollback_settled
[ "$(grep -c '^rollback$' "$WORK_DIRECTORY/events")" -eq 2 ] || {
  printf '%s\n' "ERROR: Repeated explicit rollback was not idempotent." >&2
  exit 1
}
release_load_anchor
wait_for_units_unloaded "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER" \
  "$SERVICE" "$SOCKET"

# Reload the garbage-collected rollback units, re-arm a fresh timer, then close
# the cancellation race without disturbing protected service state.
start_protected_service
sleep 0.1
prepare_units_for_reuse "$ROLLBACK_SERVICE" inactive \
  "$ROLLBACK_TIMER" inactive
systemctl start "$ROLLBACK_TIMER"
assert_fresh_timer_history
cancel_rollback_timer_race_safely
systemctl is-active --quiet "$SERVICE" && systemctl is-active --quiet "$SOCKET" || {
  printf '%s\n' "ERROR: Timer cancellation disturbed the protected service/socket." >&2
  exit 1
}
[ -e "$WORK_DIRECTORY/exposure" ] && [ -e "$WORK_DIRECTORY/guard" ] || {
  printf '%s\n' "ERROR: Timer cancellation disturbed protected publication state." >&2
  exit 1
}
release_load_anchor
wait_for_units_unloaded "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER"

# Re-arm again and prove the timer independently dispatches the same rollback.
sleep 0.1
prepare_units_for_reuse "$ROLLBACK_SERVICE" inactive \
  "$ROLLBACK_TIMER" inactive
systemctl start "$ROLLBACK_TIMER"
assert_fresh_timer_history
for _attempt in $(seq 1 400); do
  if [ "$(grep -c '^rollback$' "$WORK_DIRECTORY/events")" -eq 3 ]; then
    break
  fi
  sleep 0.1
done
assert_rollback_settled
[ "$(grep -c '^rollback$' "$WORK_DIRECTORY/events")" -eq 3 ] || {
  printf '%s\n' "ERROR: Timed fallback did not independently complete rollback." >&2
  exit 1
}
stop_rollback_timer_strictly
release_load_anchor
wait_for_units_unloaded "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER" \
  "$SERVICE" "$SOCKET"

printf '%s\n' \
  "Systemd rehearsal passed: post-start failure retained the guard; explicit rollback completed without timeout or orphan, remained idempotent, and timed fallback independently stopped socket then service."
printf '%s\n' \
  "This proves disposable Linux systemd transaction semantics only; it does not prove a real Docker host reboot."
