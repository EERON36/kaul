#!/usr/bin/env bash

set -Eeuo pipefail

[ "$(id -u)" -eq 0 ] || {
  printf '%s\n' "ERROR: The disposable systemd rehearsal must run as root." >&2
  exit 1
}
command -v systemctl >/dev/null 2>&1 || {
  printf '%s\n' "ERROR: systemctl is required." >&2
  exit 1
}
command -v systemd-analyze >/dev/null 2>&1 || {
  printf '%s\n' "ERROR: systemd-analyze is required." >&2
  exit 1
}

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
readonly WORK_DIRECTORY="/run/${UNIT}"
readonly UNIT_DIRECTORY="/run/systemd/system"
readonly SERVICE_PATH="${UNIT_DIRECTORY}/${SERVICE}"
readonly SOCKET_PATH="${UNIT_DIRECTORY}/${SOCKET}"
readonly FIREWALL_PATH="${UNIT_DIRECTORY}/${FIREWALL_SERVICE}"
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
  systemctl stop "$SOCKET" "$SERVICE" "$FIREWALL_SERVICE" >/dev/null 2>&1
  systemctl reset-failed "$SERVICE" "$FIREWALL_SERVICE" >/dev/null 2>&1
  rm -f -- "$SERVICE_PATH" "$SOCKET_PATH" "$FIREWALL_PATH" "$DROP_IN_PATH"
  rmdir -- "$DROP_IN_DIRECTORY" >/dev/null 2>&1 || true
  rm -rf -- "$WORK_DIRECTORY"
  systemctl daemon-reload >/dev/null 2>&1
  if systemctl cat "$SERVICE" >/dev/null 2>&1 ||
    systemctl cat "$SOCKET" >/dev/null 2>&1 ||
    systemctl cat "$FIREWALL_SERVICE" >/dev/null 2>&1 ||
    [ -e "$WORK_DIRECTORY" ]; then
    printf '%s\n' "ERROR: Disposable systemd rehearsal cleanup could not be verified." >&2
    [ "$original_status" -ne 0 ] || original_status=2
  else
    printf '%s\n' "Disposable systemd firewall lifecycle cleanup verified."
  fi
  exit "$original_status"
}
trap cleanup EXIT

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
    printf '%s\n' verify-failed >> "$WORK_DIRECTORY/events"
    exit 1
    ;;
  fail-closed)
    systemctl stop "$SOCKET"
    rm -f -- "$WORK_DIRECTORY/exposure"
    [ -e "$WORK_DIRECTORY/guard" ]
    printf '%s\n' fail-closed >> "$WORK_DIRECTORY/events"
    ;;
  *) exit 2 ;;
esac
EOF
chmod 0755 "$HELPER_PATH"

cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=Disposable Docker bootstrap rehearsal

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

[Install]
WantedBy=sockets.target
EOF

systemd-analyze verify "$SERVICE_PATH" "$SOCKET_PATH" "$FIREWALL_PATH"
systemctl daemon-reload

# Rehearse first installation: the already-running base service is stopped
# before guard-dependent hooks are installed and reloaded.
systemctl start "$SERVICE"
for _attempt in $(seq 1 30); do
  if [ -e "$WORK_DIRECTORY/exposure" ] &&
    systemctl is-active --quiet "$SERVICE"; then
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
systemd-analyze verify "$SERVICE_PATH" "$SOCKET_PATH" "$FIREWALL_PATH"
systemctl daemon-reload
systemctl start "$SOCKET"
[ "$(systemctl is-active "$SOCKET")" = active ] || {
  printf '%s\n' "ERROR: Disposable socket did not become active." >&2
  exit 1
}

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
touch "$WORK_DIRECTORY/ufw-active"
systemctl start "$FIREWALL_SERVICE"
[ "$(systemctl is-active "$FIREWALL_SERVICE")" = active ] || {
  printf '%s\n' "ERROR: Disposable UFW dependency did not become active." >&2
  exit 1
}
systemctl start "$SOCKET"

if systemctl start "$SERVICE"; then
  printf '%s\n' "ERROR: Intentional post-start verification failure was accepted." >&2
  exit 1
fi

for _attempt in $(seq 1 30); do
  service_state=$(systemctl is-active "$SERVICE" 2>/dev/null || true)
  socket_state=$(systemctl is-active "$SOCKET" 2>/dev/null || true)
  if { [ "$service_state" = failed ] || [ "$service_state" = inactive ]; } &&
    [ "$socket_state" = inactive ]; then
    break
  fi
  sleep 0.1
done

service_state=$(systemctl is-active "$SERVICE" 2>/dev/null || true)
socket_state=$(systemctl is-active "$SOCKET" 2>/dev/null || true)
{ [ "$service_state" = failed ] || [ "$service_state" = inactive ]; } || {
  printf '%s\n' "ERROR: Failed service remained active after post-start verification failure." >&2
  exit 1
}
[ "$socket_state" = inactive ] || {
  printf '%s\n' "ERROR: Socket activation remained available after service failure." >&2
  exit 1
}
[ ! -e "$WORK_DIRECTORY/exposure" ] || {
  printf '%s\n' "ERROR: Simulated publication remained after service failure." >&2
  exit 1
}
[ -e "$WORK_DIRECTORY/guard" ] || {
  printf '%s\n' "ERROR: Simulated firewall guard was removed after service failure." >&2
  exit 1
}
[ "$(cat "$WORK_DIRECTORY/events")" = $'preflight\napply\nverify-failed\nfail-closed' ] || {
  printf '%s\n' "ERROR: systemd did not execute the expected firewall lifecycle order." >&2
  exit 1
}

printf '%s\n' \
  "Systemd rehearsal passed: bootstrap ordering and the UFW dependency failed closed before post-start failure cleanup retained the guard."
printf '%s\n' \
  "This proves bounded systemd failure semantics only; it does not prove a real Docker host reboot."
