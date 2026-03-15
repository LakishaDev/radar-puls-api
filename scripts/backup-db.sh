#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/radar-puls}"
DB_CONTAINER="${DB_CONTAINER:-radar-puls-db-1}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-radar_puls}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FILENAME="${DB_NAME}_${TIMESTAMP}.sql.gz"
TARGET_PATH="${BACKUP_DIR}/${FILENAME}"

# Stream dump directly to gzip to avoid temporary plaintext SQL on disk.
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$TARGET_PATH"

find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "Backup created: ${TARGET_PATH}"
