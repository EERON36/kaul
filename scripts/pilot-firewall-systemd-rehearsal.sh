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
readonly WORK_DIRECTORY="/run/${UNIT}"
readonly UNIT_DIRECTORY="/run/systemd/system"
readonly SERVICE_PATH="${UNIT_DIRECTORY}/${SERVICE}"
readonly SOCKET_PATH="${UNIT_DIRECTORY}/${SOCKET}"
readonly FIREWALL_PATH="${UNIT_DIRECTORY}/${FIREWALL_SERVICE}"
readonly ROLLBACK_PATH="${UNIT_DIRECTORY}/${ROLLBACK_SERVICE}"
readonly TIMER_PATH="${UNIT_DIRECTORY}/${ROLLBACK_TIMER}"
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
  systemctl stop "$ROLLBACK_TIMER" "$ROLLBACK_SERVICE" "$SOCKET" \
    "$SERVICE" "$FIREWALL_SERVICE" >/dev/null 2>&1
  systemctl reset-failed "$ROLLBACK_SERVICE" "$SERVICE" \
    "$FIREWALL_SERVICE" >/dev/null 2>&1
  rm -f -- "$SERVICE_PATH" "$SOCKET_PATH" "$FIREWALL_PATH" \
    "$ROLLBACK_PATH" "$TIMER_PATH" "$DROP_IN_PATH"
  rmdir -- "$DROP_IN_DIRECTORY" >/dev/null 2>&1 || true
  rm -rf -- "$WORK_DIRECTORY"
  systemctl daemon-reload >/dev/null 2>&1
  if systemctl cat "$SERVICE" >/dev/null 2>&1 ||
    systemctl cat "$SOCKET" >/dev/null 2>&1 ||
    systemctl cat "$FIREWALL_SERVICE" >/dev/null 2>&1 ||
    systemctl cat "$ROLLBACK_SERVICE" >/dev/null 2>&1 ||
    systemctl cat "$ROLLBACK_TIMER" >/dev/null 2>&1 ||
    [ -e "$WORK_DIRECTORY" ]; then
    printf '%s\n' "ERROR: Disposable systemd rehearsal cleanup could not be verified." >&2
    [ "$original_status" -ne 0 ] || original_status=2
  else
    printf '%s\n' "Disposable systemd firewall lifecycle cleanup verified."
  fi
  exit "$original_status"
}
trap cleanup EXIT

wait_for_stopped_units() {
  local service_state socket_state unit_jobs
  for _attempt in $(seq 1 50); do
    service_state=$(systemctl is-active "$SERVICE" 2>/dev/null || true)
    socket_state=$(systemctl is-active "$SOCKET" 2>/dev/null || true)
    unit_jobs=$(systemctl list-jobs --no-legend --no-pager "$SERVICE" "$SOCKET") || {
      printf '%s\n' "ERROR: Disposable service/socket jobs could not be inspected." >&2
      exit 1
    }
    if { [ "$service_state" = failed ] || [ "$service_state" = inactive ]; } &&
      [ "$socket_state" = inactive ] &&
      [ -z "$unit_jobs" ]; then
      return
    fi
    sleep 0.1
  done
  printf 'ERROR: Disposable service/socket did not settle inactive (service=%s, socket=%s).\n' \
    "$service_state" "$socket_state" >&2
  exit 1
}

assert_rollback_settled() {
  local rollback_jobs rollback_state
  wait_for_stopped_units
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

cancel_rollback_timer_race_safely() {
  local rollback_jobs rollback_state
  systemctl stop "$ROLLBACK_TIMER"
  [ "$(systemctl is-active "$ROLLBACK_TIMER" 2>/dev/null || true)" = inactive ] || {
    printf '%s\n' "ERROR: Disposable rollback timer remained active after cancellation." >&2
    exit 1
  }
  for _attempt in $(seq 1 50); do
    rollback_state=$(systemctl show --property=ActiveState --value \
      "$ROLLBACK_SERVICE") || exit 1
    rollback_jobs=$(systemctl list-jobs --no-legend --no-pager \
      "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER") || {
      printf '%s\n' "ERROR: Cancellation-race jobs could not be inspected." >&2
      exit 1
    }
    case "$rollback_state" in
      inactive|failed) [ -z "$rollback_jobs" ] && return ;;
    esac
    sleep 0.1
  done
  printf '%s\n' "ERROR: Disposable rollback cancellation did not settle race-safely." >&2
  exit 1
}

start_protected_service() {
  systemctl reset-failed "$SERVICE" "$ROLLBACK_SERVICE"
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

systemd-analyze verify "$SERVICE_PATH" "$SOCKET_PATH" "$FIREWALL_PATH" \
  "$ROLLBACK_PATH" "$TIMER_PATH"
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
  "$ROLLBACK_PATH" "$TIMER_PATH"
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
rm -f -- "$WORK_DIRECTORY/events" "$WORK_DIRECTORY/guard"
systemctl reset-failed "$SERVICE" "$FIREWALL_SERVICE"
touch "$WORK_DIRECTORY/ufw-active" "$WORK_DIRECTORY/verify-failure"
systemctl start "$FIREWALL_SERVICE"
systemctl start "$SOCKET"
if systemctl start "$SERVICE"; then
  printf '%s\n' "ERROR: Intentional post-start verification failure was accepted." >&2
  exit 1
fi
wait_for_stopped_units
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
start_protected_service
timeout 10 systemctl start "$ROLLBACK_SERVICE"
assert_rollback_settled
explicit_count=$(grep -c '^rollback$' "$WORK_DIRECTORY/events")
[ "$explicit_count" -eq 1 ] || {
  printf '%s\n' "ERROR: Explicit rollback did not complete exactly once." >&2
  exit 1
}

# The same explicit operation remains safe and bounded when already rolled back.
timeout 10 systemctl start "$ROLLBACK_SERVICE"
assert_rollback_settled
[ "$(grep -c '^rollback$' "$WORK_DIRECTORY/events")" -eq 2 ] || {
  printf '%s\n' "ERROR: Repeated explicit rollback was not idempotent." >&2
  exit 1
}

# Preserve the historical explicit rollback timestamp, re-arm a fresh timer,
# then close the cancellation race without disturbing protected service state.
start_protected_service
sleep 0.1
systemctl stop "$ROLLBACK_TIMER"
systemctl reset-failed "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER"
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

# Re-arm again and prove the timer independently dispatches the same rollback.
sleep 0.1
systemctl reset-failed "$ROLLBACK_SERVICE" "$ROLLBACK_TIMER"
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

printf '%s\n' \
  "Systemd rehearsal passed: post-start failure retained the guard; explicit rollback completed without timeout or orphan, remained idempotent, and timed fallback independently stopped socket then service."
printf '%s\n' \
  "This proves disposable Linux systemd transaction semantics only; it does not prove a real Docker host reboot."
