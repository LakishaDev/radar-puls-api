# Next Context Handoff (radar-puls-api)

Date: 2026-03-12

## Completed Phases

- **Phase 2** (ingestion MVP): NestJS + TypeORM, `POST /api/events/viber`, bearer device auth, structured logs, migrations, e2e tests — DONE
- **Phase 3A** (worker): Standalone worker process, claim-based idempotent processing, retry/backoff, lease timeout reclaim, dev trigger, Docker compose with startup order fix — DONE
- **Phase 3B** (parsing): Rule-based Serbian text parser, `parsed_events` table, worker integration, backfill service + CLI + HTTP endpoint, config vars, observability logs — DONE

## Current State (2026-03-12)

- Docker stack: `db` (postgres:16), `api` (port 3000, runs migrations on start), `worker` (starts after `api: service_healthy`)
- 4 e2e suites, **30 tests, all passing**
- `parsed_events` table exists in Postgres with UNIQUE(raw_event_id), FK→raw_events, confidence CHECK
- Worker integration: `processEvent()` calls `parseRawMessage()` then `persistParsed()` before markProcessed
- Backfill: `BackfillService` + `backfill.bootstrap.ts` CLI + `POST /api/processing/dev/backfill` endpoint, gated via `ENABLE_BACKFILL`

### Key Technical Notes

- **TypeORM UPDATE RETURNING bug**: `repository.query()` returns `[rows, rowCount]` for UPDATE/DELETE. Always destructure: `const [rows] = await repo.query(updateSQL, params)`
- **CTE claim SQL**: `WITH candidates AS (SELECT ... FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE ... RETURNING id, raw_message`
- **Case preservation**: Parser normalizes to lowercase for matching, extracts from original string to preserve casing (e.g. "Bulevara Nemanjića")
- **Status semantics**: `parse_status` (parsed/no_match/partial) is independent of worker `processing_status`; `no_match` = processed, not retried
- **Confidence formula**: 0.5 (type) + 0.25 (location) + 0.15 (time) + 0.10 (multi-signal bonus), threshold=0.5
- **Backfill guard**: Separate `BACKFILL_TRIGGER_TOKEN` from `PROCESSING_DEV_TRIGGER_TOKEN`; also `ENABLE_BACKFILL=true` required
- **BackfillService.ensureEnabled()**: Throws immediately if `ENABLE_BACKFILL != "true"`, logged as `backfill_disabled_blocked`

### Files Added/Modified in Phase 3B

| File | Change |
|---|---|
| `src/parsing/types.ts` | EventType, ParseStatus, ParsingContext, ParsingResult, ParsedEvent |
| `src/parsing/parsing.service.ts` | Rule engine + persistParsed() + parse_result log |
| `src/parsing/parsing.module.ts` | NestJS module |
| `src/database/parsed-event.entity.ts` | TypeORM entity |
| `src/database/migrations/1710350000000-CreateParsedEventsTable.ts` | Schema migration |
| `src/database/data-source.ts` | ParsedEventEntity registered |
| `src/database/database.module.ts` | ParsedEventEntity in forFeature |
| `src/processing/processing.service.ts` | Injected ParsingService, calls parse before markProcessed |
| `src/processing/processing.module.ts` | ParsingModule + BackfillService + BackfillGuard |
| `src/processing/backfill.service.ts` | Batch backfill + id-specific replay + find-missing |
| `src/processing/backfill.bootstrap.ts` | CLI entry point |
| `src/processing/backfill.guard.ts` | ProcessingBackfillGuard with BACKFILL_TRIGGER_TOKEN |
| `src/processing/processing.controller.ts` | POST /api/processing/dev/backfill |
| `src/config/env.validation.ts` | PARSER_VERSION, ENABLE_BACKFILL, BACKFILL_TRIGGER_TOKEN |
| `test/parsing.e2e-spec.ts` | 10 parser scenarios |
| `test/backfill.e2e-spec.ts` | 6 BackfillService unit tests |
| `test/processing.e2e-spec.ts` | ParsingService mock + BackfillGuard |
| `package.json` | start:backfill, start:backfill:dev scripts |

## Phase 3B Completion Summary

- Parser module implemented and integrated in worker flow
- `parsed_events` schema introduced with idempotent upsert by `raw_event_id`
- Backfill available through CLI and protected dev endpoint
- Config validation includes parser/backfill variables
- Endpoint e2e coverage added for `/api/processing/dev/backfill` (200/401/404)
- Build and e2e test suite passing

## Next Phase (Phase 4)

**Geocoding ili LLM integracija**

- Kandidati: Google Maps Geocoding API, OpenStreetMap Nominatim, ili LLM prompt engineering za bolje parsiranje
- Ulazna tačka: `src/parsing/parsing.service.ts` metoda `extractLocation()` vraća slobodan tekst koji se može geocodovati
- Constraint: Geocoding bi trebalo biti odvojena async faza (ne blokira worker), sa sopstvenim statusom
- Alternativa: Poboljšati confidence heuristike sa ML scoring-om pre geocodinga

## Copy-Paste Prompt Za Novi Chat (Phase 4 start)

Continue in `radar-puls-api`. Phase 2, Phase 3A, and Phase 3B are complete. Current baseline:

- ingestion endpoint and worker lifecycle stable
- parsing pipeline writes to `parsed_events`
- backfill exists via CLI and protected dev endpoint
- 30/30 e2e tests passing

Start Phase 4 by designing geocoding enrichment as a separate async stage that consumes parsed location text (do not block current worker claim loop). Propose schema changes, service boundaries, retry semantics, and tests before implementation.
