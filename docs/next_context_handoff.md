# Next Context Handoff (radar-puls-api)

Date: 2026-03-12

## Completed Phases

- **Phase 2** (ingestion MVP): NestJS + TypeORM, `POST /api/events/viber`, bearer device auth, structured logs, migrations, e2e tests — DONE
- **Phase 3A** (worker): Standalone worker process, claim-based idempotent processing, retry/backoff, lease timeout reclaim, dev trigger, Docker compose with startup order fix — DONE
- **Phase 3B** (parsing): Rule-based Serbian text parser, `parsed_events` table, worker integration, backfill service + CLI + HTTP endpoint, config vars, observability logs — DONE
- **Phase 4** (AI enrichment): minimal parse rule stage + async OpenAI enrichment poller (`gpt-4o-mini`) with `sender_name` and `enrich_status` lifecycle — DONE

## Current State (2026-03-12)

- Docker stack: `db` (postgres:16), `api` (port 3000), `worker`, `enrichment` (starts after `api: service_healthy`)
- 5 e2e suites, **30 tests, all passing**
- `parsed_events` now includes enrichment fields: `sender_name`, `enrich_status`, `enriched_at`
- Worker integration remains unchanged: parse in worker loop, then mark `raw_events` processed
- Enrichment integration: separate `EnrichmentService` poller updates `parsed_events` asynchronously
- Backfill remains available and now produces `enrich_status='pending'` for readable replayed records

### Key Technical Notes

- **TypeORM UPDATE RETURNING bug**: `repository.query()` returns `[rows, rowCount]` for UPDATE/DELETE. Always destructure: `const [rows] = await repo.query(updateSQL, params)`
- **CTE claim SQL**: `WITH candidates AS (SELECT ... FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE ... RETURNING id, raw_message`
- **Rule parser simplification**: readable filter (`min 3` chars and `>=50%` unicode letters/spaces) + first `HH:MM` extraction only
- **Status semantics**: `parse_status='parsed'` for readable text and sets `enrich_status='pending'`; unreadable text -> `parse_status='no_match'`, `enrich_status=NULL`
- **Enrichment failure handling**: OpenAI errors are swallowed per-record and mapped to `enrich_status='failed'` (no throw, loop continues)
- **Backfill guard**: Separate `BACKFILL_TRIGGER_TOKEN` from `PROCESSING_DEV_TRIGGER_TOKEN`; also `ENABLE_BACKFILL=true` required
- **BackfillService.ensureEnabled()**: Throws immediately if `ENABLE_BACKFILL != "true"`, logged as `backfill_disabled_blocked`

### Files Added/Modified in Phase 3B

| File | Change |
|---|---|
| `src/parsing/types.ts` | EventType, ParseStatus, ParsingContext, ParsingResult, ParsedEvent |
| `src/parsing/parsing.service.ts` | Minimal readable/time rule phase + enrich_status propagation |
| `src/parsing/parsing.module.ts` | NestJS module |
| `src/database/parsed-event.entity.ts` | TypeORM entity |
| `src/database/migrations/1710350000000-CreateParsedEventsTable.ts` | Schema migration |
| `src/database/migrations/1710360000000-AddEnrichmentFieldsToParsedEvents.ts` | Enrichment schema migration |
| `src/database/data-source.ts` | ParsedEventEntity registered |
| `src/database/database.module.ts` | ParsedEventEntity in forFeature |
| `src/processing/processing.service.ts` | Injected ParsingService, calls parse before markProcessed |
| `src/processing/processing.module.ts` | ParsingModule + BackfillService + BackfillGuard |
| `src/enrichment/enrichment.service.ts` | Async poller + OpenAI extraction + enrich_status updates |
| `src/enrichment/enrichment.module.ts` | NestJS module for enrichment |
| `src/enrichment/enrichment.bootstrap.ts` | CLI bootstrap for enrichment process |
| `src/processing/backfill.service.ts` | Batch backfill + id-specific replay + find-missing |
| `src/processing/backfill.bootstrap.ts` | CLI entry point |
| `src/processing/backfill.guard.ts` | ProcessingBackfillGuard with BACKFILL_TRIGGER_TOKEN |
| `src/processing/processing.controller.ts` | POST /api/processing/dev/backfill |
| `src/config/env.validation.ts` | Added OpenAI/enrichment env vars validation |
| `test/parsing.e2e-spec.ts` | Readability/time/enrich_status parser scenarios |
| `test/enrichment.e2e-spec.ts` | Enrichment poller success/failure mapping |
| `test/backfill.e2e-spec.ts` | 6 BackfillService unit tests |
| `test/processing.e2e-spec.ts` | ParsingService mock + BackfillGuard |
| `package.json` | start:enrichment, start:enrichment:dev scripts |
| `docker-compose.yml` | Added enrichment service + OpenAI/enrichment env wiring |

## Phase 4 Completion Summary

- Parser zamenjen minimalnim rule engine-om (readable + HH:MM)
- `parsed_events` proširen za enrichment lifecycle kolone
- Async enrichment proces uveden kao odvojen bootstrap (`start:enrichment(:dev)`)
- OpenAI prompt i JSON extraction implementirani sa graceful failure handling
- Docker compose proširen novim servisom i env var-ovima
- Build, e2e, migration i compose runtime verifikovani

## Next Phase

- Definisati retry strategiju za `enrich_status='failed'` (npr. cooldown + max attempts)
- Dodati po potrebi endpoint/CLI za ručni retry failed enrichment zapisa
- Opcionalno unaprediti prompt i/ili dodati geocoding fazu posle enrichment-a

## Copy-Paste Prompt Za Novi Chat (Phase 4 start)

Continue in `radar-puls-api`. Phases 2, 3A, 3B and 4 are complete. Current baseline:

- worker parsing is minimal and writes `enrich_status='pending'` for readable rows
- dedicated `enrichment` process polls pending rows and updates sender/location/event type
- failures are recorded as `enrich_status='failed'`
- build and e2e are green (30/30)

Next, implement retry policy for failed enrichment records (cooldown + bounded retries) and add tests for retry selection logic.
