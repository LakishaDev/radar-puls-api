# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (Docker recommended)
npm run docker:up           # Start db, api, worker, enrichment
npm run docker:migrate      # Run pending migrations in container
npm run docker:logs         # Follow all service logs
npm run docker:down         # Stop all services

# Development (local, three terminals)
npm run start:dev           # Main API (port 3000)
npm run start:worker:dev    # Worker process
npm run start:enrichment:dev # Enrichment process

# Build & migrations
npm run build               # TypeScript → dist/
npm run migration:run       # Apply pending migrations
npm run migration:revert    # Revert last migration

# Tests
npm run test:e2e            # Run E2E tests (Jest, *.e2e-spec.ts)
```

## Architecture

The API runs as **three separate processes** that share a PostgreSQL database:

1. **API process** (`main.ts`) — Accepts Viber webhook events, stores to `raw_events`, serves the map and admin REST + Socket.IO endpoints.
2. **Worker process** (`processing/worker.bootstrap.ts`) — Polls `raw_events` using a claim/lease lifecycle, parses messages, writes `parsed_events`. Handles retries with exponential backoff (30s → 2m → 10m, max `WORKER_MAX_RETRIES`).
3. **Enrichment process** (`enrichment/enrichment.bootstrap.ts`) — Polls `parsed_events` where `enrich_status='pending'`, calls OpenAI (`gpt-4o-mini` by default) to extract `sender_name`, `location_text`, `event_type`, and a confidence score.

A fourth **Backfill CLI** (`processing/backfill.bootstrap.ts`) can re-parse historical events.

### Data flow

```
Viber webhook → raw_events (pending)
                    ↓ Worker
              parsed_events (enrich_status=pending)
                    ↓ Enrichment process
              parsed_events (enrich_status=enriched | failed)
                    ↓ Geocoding (inline, cached)
              parsed_events (latitude/longitude populated)
                    ↓ Moderation (auto_approved → pending_review → approved)
              Public map & Socket.IO push
```

### Parsing pipeline (two phases)

- **Rule phase** (worker): Readability check (≥3 chars, ≥50% letter/space), HH:MM time extraction, keyword-based event-type detection (`keyword-parsing.service.ts`).
- **AI phase** (enrichment): OpenAI extracts structured fields. Results are cached in `enrichment_cache` to avoid duplicate API calls for identical messages.

### Database layer

TypeORM with explicit migrations (no `synchronize: true`). Key entities:

| Entity | Table | Purpose |
|---|---|---|
| `RawEventEntity` | `raw_events` | Ingestion buffer; processing lifecycle |
| `ParsedEventEntity` | `parsed_events` | Enriched events; moderation; voting; geo |
| `EnrichmentCacheEntity` | `enrichment_cache` | Dedup AI calls by message hash |
| `GeocodingCacheEntity` | `geocoding_cache` | Dedup Google Geocoding lookups |
| `LocationAliasEntity` | `location_aliases` | Manual location overrides |

Migrations live in `src/database/migrations/` and are the source of truth for schema changes.

### Authentication

- **Device API** (`/api/events/viber`, `/api/events/map`): Bearer token matched against `DEVICE_TOKENS_JSON` map (keyed by `device_id`). Guard: `device-auth.guard.ts`.
- **Admin API** (`/api/admin/*`): Static bearer token `ADMIN_API_TOKEN`. Guard: `admin-auth.guard.ts`.
- **Socket.IO admin channel**: `ADMIN_API_TOKEN` in handshake auth.
- **Public map** (`/api/map/*`): No auth; IP-based rate limiting guards.

### Real-time

Socket.IO at `/socket.io`. Public rooms: `new_report`, `report_updated`, `report_removed`. Admin-authenticated room: `event` (full event payload). Internal pub/sub via `RealtimePublisher` (RxJS Subject).

### Configuration

All env vars are validated at startup via `src/config/env.validation.ts` (class-validator). Required vars:

```
DATABASE_URL
DEVICE_TOKENS_JSON   # JSON object: {"device_id": "bearer_token"}
OPENAI_API_KEY
GOOGLE_GEOCODING_API_KEY
ADMIN_API_TOKEN
```

Notable tunables: `WORKER_BATCH_SIZE` (default 100), `WORKER_POLL_INTERVAL_MS` (5000), `ENRICHMENT_BATCH_SIZE` (10), `ENRICHMENT_POLL_INTERVAL_MS` (10000), `OPENAI_MODEL` (gpt-4o-mini), `GEO_ENABLED`, `CORS_ORIGIN`.

## Key file locations

| Concern | Path |
|---|---|
| Root module wiring | `src/app.module.ts` |
| API bootstrap | `src/main.ts` |
| Worker bootstrap | `src/processing/worker.bootstrap.ts` |
| Enrichment bootstrap | `src/enrichment/enrichment.bootstrap.ts` |
| Worker core loop | `src/processing/processing.service.ts` |
| AI enrichment loop | `src/enrichment/enrichment.service.ts` |
| Parsing rules | `src/parsing/parsing.service.ts`, `keyword-parsing.service.ts` |
| Largest service | `src/admin/admin.service.ts` |
| Env schema | `src/config/env.validation.ts` |
| DB entities | `src/database/*.entity.ts` |
| Migrations | `src/database/migrations/` |
