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

- none (Phase 6 backend APIs implemented)

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
- `OPENAI_API_KEY` - OpenAI API key for enrichment stage
- `OPENAI_MODEL` - optional model override (`gpt-4o-mini` default)
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
- `ENRICHMENT_POLL_INTERVAL_MS` - enrichment poll interval (default 10000)
- `ENRICHMENT_BATCH_SIZE` - enrichment batch size (default 10)
- `ENRICHMENT_MAX_ATTEMPTS` - max enrichment retries before permanent `failed` (default 3)
- `ENRICHMENT_RETRY_COOLDOWN_MS` - base retry cooldown for enrichment retry backoff (default 60000)
- `CORS_ORIGIN` - optional comma-separated allowed web origins for CORS
- `ADMIN_API_TOKEN` - static bearer token used by admin endpoints/guard
- `RECAPTCHA_SECRET_KEY` - optional reCAPTCHA secret for public report submission
- `VAPID_PUBLIC_KEY` - optional Web Push VAPID public key
- `VAPID_PRIVATE_KEY` - optional Web Push VAPID private key
- `VAPID_SUBJECT` - optional VAPID subject (e.g. `mailto:alerts@domain.com`)

Example:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/radar_puls
DEVICE_TOKENS_JSON={"android_listener_01":"dev-token-01"}
OPENAI_API_KEY=dev-openai-key
OPENAI_MODEL=gpt-4o-mini
WORKER_BATCH_SIZE=100
WORKER_POLL_INTERVAL_MS=5000
WORKER_LEASE_TIMEOUT_MS=300000
WORKER_MAX_RETRIES=3
WORKER_INSTANCE_ID=dev-worker-1
ENRICHMENT_POLL_INTERVAL_MS=10000
ENRICHMENT_BATCH_SIZE=10
ENRICHMENT_MAX_ATTEMPTS=3
ENRICHMENT_RETRY_COOLDOWN_MS=60000
CORS_ORIGIN=http://localhost:3000
ADMIN_API_TOKEN=dev-admin-token
RECAPTCHA_SECRET_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:alerts@radar-puls.local
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
npm run start:enrichment:dev
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
- Enrichment: separate `enrichment` service (`npm run start:enrichment:dev`)
- DB host for API container: `db`
- DB URL: `postgres://postgres:postgres@db:5432/radar_puls`
- Persistent DB volume: `postgres_data`

### Endpoints

- `GET /health`
- `POST /api/events/viber`
- `GET /api/events/map` (device auth protected, includes `rawMessage`)
- `GET /api/map/reports` (public, IP rate limited, no `rawMessage`)
- `POST /api/map/reports` (public submission, stricter IP rate limit, pending moderation)
- `POST /api/map/reports/:id/vote` (public, one vote per IP/report)
- `POST /api/map/subscriptions` (public, register Web Push subscription)
- `DELETE /api/map/subscriptions` (public, unregister Web Push subscription)
- `GET /api/stats/public` (public map statistics)
- `GET /api/admin/events` (admin token protected)
- `GET /api/admin/events/:id` (admin token protected)
- `PATCH /api/admin/events/:id` (admin token protected)
- `POST /api/admin/events/:id/approve` (admin token protected)
- `POST /api/admin/events/:id/reject` (admin token protected)
- `GET /api/admin/stats` (admin token protected)
- `POST /api/admin/events/:id/re-enrich` (admin token protected)
- `POST /api/admin/events/re-enrich-batch` (admin token protected)
- `POST /api/processing/dev/run-once` (development only, bearer token protected)
- `POST /api/processing/dev/backfill` (development/feature-flag only, bearer token protected)

Realtime channel:

- `WS /ws` (Socket.IO path)
- emitted events: `new_report`, `report_updated`, `report_removed`

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

Rule phase behavior:

- checks readability (`min 3 chars` and at least `50%` unicode letters/spaces)
- extracts explicit first time in `HH:MM` format
- sets `event_type='unknown'`, `confidence=0`
- sets `enrich_status='pending'` for readable messages, otherwise `enrich_status=NULL`

Parse status semantics:

- `parsed` means message has enough structured signal confidence
- `no_match` means message is unreadable and will not be sent to enrichment
- `no_match` is still a successful worker outcome (`processing_status=processed`), not retryable failure

## Enrichment (Phase 4)

Enrichment runs as a separate async poller process and never blocks worker claim loop.

Pipeline:

- worker writes `parsed_events` with `parse_status` and `enrich_status`
- enrichment process polls `parsed_events` where `enrich_status='pending'`
- OpenAI (`gpt-4o-mini` by default) extracts `sender_name`, `location_text`, and optional `event_type`
- record is updated to `enrich_status='enriched'` with `enriched_at=NOW()`
- on AI error, record moves to `enrich_status='failed'`

New DB fields in `parsed_events`:

- `sender_name TEXT NULL`
- `enrich_status TEXT NULL` (`pending|enriched|failed`)
- `enriched_at TIMESTAMPTZ NULL`

Index for poller query:

- `(enrich_status, created_at)`

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
