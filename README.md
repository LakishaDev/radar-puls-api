# radar-puls-api

Backend ingestion service for Radar Puls.

## Scope (Phase 2)

This repository is responsible for backend ingestion only:

- accept webhook events from Android listener
- validate payload and authorization
- store raw events in database
- return deterministic API responses

Out of scope for initial backend milestone:

- AI parsing and normalization
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

Example:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/radar_puls
DEVICE_TOKENS_JSON={"android_listener_01":"dev-token-01"}
```

### Commands

```bash
npm install
npm run build
npm run migration:run
npm run start:dev
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

Default compose values:

- API: `http://localhost:3000`
- DB host for API container: `db`
- DB URL: `postgres://postgres:postgres@db:5432/radar_puls`
- Persistent DB volume: `postgres_data`

### Endpoints

- `GET /health`
- `POST /api/events/viber`

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
