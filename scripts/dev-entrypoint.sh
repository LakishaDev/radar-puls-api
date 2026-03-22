#!/bin/sh

set -eu

cd /app

LOCKFILE="package-lock.json"
STAMP_FILE="node_modules/.package-lock.sha256"

if [ ! -f "$LOCKFILE" ]; then
  echo "Missing $LOCKFILE, skipping dependency sync."
  exec "$@"
fi

CURRENT_HASH="$(sha256sum "$LOCKFILE" | awk '{print $1}')"
SAVED_HASH=""

if [ -f "$STAMP_FILE" ]; then
  SAVED_HASH="$(cat "$STAMP_FILE")"
fi

if [ ! -d node_modules ] || [ "$CURRENT_HASH" != "$SAVED_HASH" ]; then
  echo "Syncing container dependencies with $LOCKFILE..."
  npm ci
  mkdir -p "$(dirname "$STAMP_FILE")"
  printf "%s" "$CURRENT_HASH" > "$STAMP_FILE"
fi

exec "$@"
