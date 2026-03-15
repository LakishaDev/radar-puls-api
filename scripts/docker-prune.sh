#!/usr/bin/env bash
set -euo pipefail

RETENTION_HOURS="${RETENTION_HOURS:-168}"

docker image prune -af --filter "until=${RETENTION_HOURS}h"
