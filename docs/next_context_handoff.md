# Next Context Handoff (radar-puls-api)

Date: 2026-03-12

## Completed Phases

- **Phase 2** (ingestion MVP): NestJS + TypeORM, `POST /api/events/viber`, bearer device auth, structured logs, migrations, e2e tests — DONE
- **Phase 3A** (worker): Standalone worker process, claim-based idempotent processing, retry/backoff, lease timeout reclaim, dev trigger, Docker compose with startup order fix — DONE

## Current State

- Docker stack: `db` (postgres:16), `api` (port 3000, runs migrations on start), `worker` (starts after `api: service_healthy`)
- All 248 events in `processed` status; worker stable at `claimed_count:0` polles
- 2 e2e suites, 10 tests, all passing
- Commit: `feat: Phase 3A – pending event worker with claim/retry/lifecycle`

### Key Technical Notes

- **TypeORM UPDATE RETURNING bug**: `repository.query()` returns `[rows, rowCount]` for UPDATE/DELETE (not just `rows`). Always destructure: `const [rows] = await repo.query(updateSQL, params)`
- **CTE claim SQL**: `WITH candidates AS (SELECT ... FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE ... RETURNING id, raw_message` — works correctly in PostgreSQL, TypeORM wrapper needs destructure fix applied
- **Processor instance ID**: `WORKER_INSTANCE_ID` env var (docker-compose sets `worker-1`); fallback `hostname()-pid`
- **Status flow**: `pending` → `processing` → `processed` | `failed` | `pending` (retry with backoff)

## Immediate Next Task

**Phase 3B – AI/NLP parsing of raw messages**

The worker processes events but does nothing with `raw_message` content yet (`processEvent` is a stub). Next:

1. Choose NLP/parsing approach (regex patterns vs LLM call vs local model)
2. Implement `parseRawMessage(rawMessage: string): ParsedEvent` in a new `src/parsing/` module
3. Persist parsed fields: event type, location, description, date/time, confidence score
4. Add `parsed_events` table (or extend raw_events with parsed fields)
5. Handle parse failures gracefully (log + mark as failed or store raw)
6. Add tests for parsing edge cases

## Constraints

- Do not implement geocoding or map API in Phase 3B
- Keep worker claim/retry logic unchanged
- Parsing should be idempotent and work on already-processed events for backfill

## Copy-Paste Prompt For New Chat

Continue in `radar-puls-api`. Phase 2 ingestion and Phase 3A worker are complete (see plan files). The worker processes events from `pending` to `processed` status via atomic claim with `FOR UPDATE SKIP LOCKED`. `processEvent()` in `src/processing/processing.service.ts` is a stub — it only marks the event as processed without parsing the content.

Next phase is AI/NLP parsing. Start by designing `src/parsing/parsing.service.ts` with a `parseRawMessage(rawMessage: string)` method. The `raw_message` field contains free-text Viber messages in Serbian about traffic/events. Choose a parsing strategy, implement it, persist parsed output, and wire it into `processEvent()`. Add tests.
