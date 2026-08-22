#!/bin/sh

set -eu

TARGET_DIRECTORY=${1:-}
[ -n "$TARGET_DIRECTORY" ] || {
  printf 'Usage: scripts/install-pinned-restic-ci.sh TARGET_DIRECTORY\n' >&2
  exit 2
}
case "$TARGET_DIRECTORY" in
  /*) ;;
  *)
    printf 'ERROR: TARGET_DIRECTORY must be absolute.\n' >&2
    exit 1
    ;;
esac
[ ! -e "$TARGET_DIRECTORY" ] || {
  printf 'ERROR: TARGET_DIRECTORY already exists; refusing to replace it.\n' >&2
  exit 1
}

RESTIC_VERSION=0.19.1
RESTIC_SHA256=f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c
REST_SERVER_VERSION=0.14.0
REST_SERVER_SHA256=4c9c95bc079a0334e81fad379b19dc5c3353c71c2c88d652cafce2081c2b1c66

[ "$(uname -s)" = Linux ] || {
  printf 'ERROR: The pinned CI installer supports Linux only.\n' >&2
  exit 1
}
[ "$(uname -m)" = x86_64 ] || {
  printf 'ERROR: The pinned CI installer supports x86_64 only.\n' >&2
  exit 1
}

for command_name in awk bunzip2 curl dirname install mktemp sha256sum tar; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'ERROR: %s is required.\n' "$command_name" >&2
    exit 1
  }
done

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
temporary_directory=$(mktemp -d)
cleanup() {
  rm -rf -- "$temporary_directory"
}
trap cleanup EXIT

restic_archive="$temporary_directory/restic_${RESTIC_VERSION}_linux_amd64.bz2"
rest_server_archive="$temporary_directory/rest-server_${REST_SERVER_VERSION}_linux_amd64.tar.gz"

curl --fail --location --proto '=https' --tlsv1.2 \
  --output "$restic_archive" \
  "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_amd64.bz2"
printf '%s  %s\n' "$RESTIC_SHA256" "$restic_archive" | sha256sum --check --status

curl --fail --location --proto '=https' --tlsv1.2 \
  --output "$rest_server_archive" \
  "https://github.com/restic/rest-server/releases/download/v${REST_SERVER_VERSION}/rest-server_${REST_SERVER_VERSION}_linux_amd64.tar.gz"
printf '%s  %s\n' "$REST_SERVER_SHA256" "$rest_server_archive" | sha256sum --check --status

install -d -m 0755 "$TARGET_DIRECTORY"
bunzip2 --stdout "$restic_archive" > "$temporary_directory/restic"
install -m 0755 "$temporary_directory/restic" "$TARGET_DIRECTORY/restic"

tar -xzf "$rest_server_archive" -C "$temporary_directory" \
  "rest-server_${REST_SERVER_VERSION}_linux_amd64/rest-server"
install -m 0755 \
  "$temporary_directory/rest-server_${REST_SERVER_VERSION}_linux_amd64/rest-server" \
  "$TARGET_DIRECTORY/rest-server"

installed_restic_version=$("$TARGET_DIRECTORY/restic" version |
  awk 'NR == 1 { print $2 }')
installed_rest_server_version=$("$TARGET_DIRECTORY/rest-server" --version |
  awk -v expected="$REST_SERVER_VERSION" \
    -f "$SCRIPT_DIRECTORY/parse-rest-server-version.awk")
[ "$installed_restic_version" = "$RESTIC_VERSION" ]
[ "$installed_rest_server_version" = "$REST_SERVER_VERSION" ]

printf 'Installed pinned restic %s and rest-server %s.\n' \
  "$RESTIC_VERSION" "$REST_SERVER_VERSION"
