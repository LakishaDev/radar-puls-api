# radar-puls-api

Backend ingestion service for Radar Puls.

## Scope (Current)

This repository is responsible for ingestion, worker processing, and rule-based parsing:

- accept webhook events from Android listener
- validate payload and authorization
- store raw events in database
- process pending events in worker loop with claim/retry lifecycle
- parse processed messages into structured `parsed_events`
- support controlled backfill for already processed events

Out of scope for current backend milestone:

- LLM-based parsing
- geocoding
- map/public API
- moderation workflow

## Recommended Stack

Choose one implementation path and stay consistent:

- FastAPI (Python) + PostgreSQL
- NestJS (TypeScript) + PostgreSQL

## First Milestone Goal

Implement `POST /api/events/viber` with:

- bearer auth validation
- payload validation
- raw event insert
- clear success/failure response mapping

## Suggested Initial Runbook

1. Create app skeleton and environment config.
2. Add health endpoint.
3. Add database connection and migration for raw events table.
4. Add `POST /api/events/viber` endpoint.
5. Add request logging with correlation id.
6. Add integration tests for 200/400/401/429/500 behavior.

## Current Implementation (NestJS)

This repository is implemented with NestJS + PostgreSQL for Phase 2 ingestion MVP.

### Environment

Copy `.env.example` values into your runtime environment:

- `PORT` - API port
- `DATABASE_URL` - PostgreSQL connection string
- `DEVICE_TOKENS_JSON` - JSON map of `device_id -> bearer token`
- `WORKER_BATCH_SIZE` - max claimed records per cycle (default 100)
- `WORKER_POLL_INTERVAL_MS` - worker polling interval (default 5000)
- `WORKER_LEASE_TIMEOUT_MS` - reclaim timeout for stuck processing leases (default 300000)
- `WORKER_MAX_RETRIES` - number of retries before `failed` (default 3)
- `WORKER_INSTANCE_ID` - optional worker identifier for logs/claims
- `ENABLE_DEV_PROCESSING_TRIGGER` - allow dev-only one-batch trigger endpoint (`true`/`false`)
- `PROCESSING_DEV_TRIGGER_TOKEN` - bearer token for dev trigger endpoint
- `PARSER_VERSION` - parser version stored in `parsed_events.parser_version`
- `ENABLE_BACKFILL` - allow backfill service/endpoint (`true`/`false`)
- `BACKFILL_TRIGGER_TOKEN` - bearer token for backfill endpoint

Example:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/radar_puls
DEVICE_TOKENS_JSON={"android_listener_01":"dev-token-01"}
WORKER_BATCH_SIZE=100
WORKER_POLL_INTERVAL_MS=5000
WORKER_LEASE_TIMEOUT_MS=300000
WORKER_MAX_RETRIES=3
WORKER_INSTANCE_ID=dev-worker-1
ENABLE_DEV_PROCESSING_TRIGGER=true
PROCESSING_DEV_TRIGGER_TOKEN=dev-processing-trigger-token
PARSER_VERSION=v1.0
ENABLE_BACKFILL=false
BACKFILL_TRIGGER_TOKEN=dev-backfill-trigger-token
```

### Commands

```bash
npm install
npm run build
npm run migration:run
npm run start:dev
npm run start:worker:dev
npm run start:backfill:dev
```

Run tests:

```bash
npm run test:e2e
```

### Docker Local Development (WSL)

This setup is for local development (non-production) with Postgres + API in containers.

Use a user WSL distro terminal (recommended: Ubuntu with Docker Desktop WSL integration enabled), then run commands from the project directory.

1. Start stack:

```bash
docker compose up -d --build
```

1. Run migrations in API container:

```bash
docker compose exec api npm run migration:run
```

1. Check logs:

```bash
docker compose logs -f api db
```

1. Stop stack:

```bash
docker compose down
```

NPM shortcuts are also available:

```bash
npm run docker:up
npm run docker:migrate
npm run docker:logs
npm run docker:down
```

WSL troubleshooting:

- If `docker` is missing in Ubuntu WSL, enable your distro in Docker Desktop -> Settings -> Resources -> WSL Integration.
- If Docker commands require `sudo`, add your user to the docker group and reopen the shell:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Default compose values:

- API: `http://localhost:3000`
- Worker: separate `worker` service (`npm run start:worker:dev`)
- DB host for API container: `db`
- DB URL: `postgres://postgres:postgres@db:5432/radar_puls`
- Persistent DB volume: `postgres_data`

### Endpoints

- `GET /health`
- `POST /api/events/viber`
- `POST /api/processing/dev/run-once` (development only, bearer token protected)
- `POST /api/processing/dev/backfill` (development/feature-flag only, bearer token protected)

`POST /api/events/viber` contract:

- Requires `Authorization: Bearer <token>`
- Validates `source`, `group`, `message`, `timestamp`, `device_id`
- Stores raw payload fields in `raw_events`
- Returns deterministic error envelope:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "request_id": "..."
  }
}
```

### Notes

- `429` response shape is implemented and can be forced with header `x-radar-force-429: 1` for contract testing.
- Real rate limiting is intentionally deferred to next phase.

## Parsing (Phase 3B)

Parser is implemented in [src/parsing/parsing.service.ts](src/parsing/parsing.service.ts) and is integrated into worker processing flow.

Rule engine behavior:

- detects event type using Serbian keyword matching (`police`, `accident`, `traffic_jam`, `radar`, `control`, fallback `unknown`)
- extracts location text using location markers (`kod`, `na`, `blizu`) while preserving original case
- extracts explicit time expressions (`HH:mm`)
- computes deterministic confidence score in range `0..1`

Confidence heuristic:

- +0.50 when event type is detected
- +0.25 when location is detected
- +0.15 when time is detected
- +0.10 bonus when at least two signals are detected
- threshold: `>= 0.5` => `parsed`, otherwise `no_match`

Parse status semantics:

- `parsed` means message has enough structured signal confidence
- `no_match` means parser executed but did not find enough signal
- `no_match` is still a successful worker outcome (`processing_status=processed`), not retryable failure

## Backfill Runbook

Backfill re-parses already processed events and writes/upserts records in `parsed_events`.

### CLI

Build first, then run:

```bash
npm run build
npm run start:backfill -- --mode=processed --limit=100
```

CLI modes:

- `--mode=processed` replay processed events (default)
- `--mode=find-missing` count processed events without `parsed_events` row

Optional flags:

- `--limit=<N>` max rows per run
- `--start=<ISO_DATE>` replay only events created after given timestamp

### HTTP endpoint

Endpoint:

- `POST /api/processing/dev/backfill?limit=50&start=2026-03-01T00:00:00.000Z`

Requirements:

- `ENABLE_BACKFILL=true`
- `BACKFILL_TRIGGER_TOKEN` set
- header `Authorization: Bearer <BACKFILL_TRIGGER_TOKEN>`

### Backfill env summary

- `PARSER_VERSION` parser version value persisted with parse result
- `ENABLE_BACKFILL` feature gate for service and endpoint
- `BACKFILL_TRIGGER_TOKEN` endpoint auth token
