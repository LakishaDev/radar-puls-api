#!/bin/sh
set -e

echo "Running database migrations..."
node ./node_modules/typeorm/cli.js -d dist/database/data-source.prod.js migration:run

echo "Starting application..."
exec "$@"
