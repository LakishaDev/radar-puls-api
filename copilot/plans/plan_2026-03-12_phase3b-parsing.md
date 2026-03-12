# Plan - Phase 3B Parsing Pipeline

Date: 2026-03-12
Status: COMPLETE (COMMIT 1-9 done)

## Goal

Implementirati rule-based parser srpskih Viber poruka sa perzistencijom u odvojenoj `parsed_events` tabeli, backfill mehanizmom za već obrađene zapise i observability logovima, koji se integriše sa Phase 3A worker ciklusom.

## Locked Decisions

- ParserApproach: Hibrid rule engine — regex + substring matching, bez LLM u ovoj fazi.
- StorageModel: Odvojena `parsed_events` tabela sa UNIQUE(raw_event_id).
- FailureHandling: `no_match` = validan izlaz (status=processed), ne trigguje retry.
- BackfillScope: Uključen; samo `processing_status=processed` eventi, feature-gated.
- ParserVersion: Čuva se u `parser_version` koloni za buduće reparse.
- UPSERT: INSERT ... ON CONFLICT(raw_event_id) DO UPDATE — idempotentno.

## Scope Included

- Rule engine: keyword detection (police/accident/traffic_jam/radar/control), location extraction, time parsing, confidence scoring
- Perzistencija: `parsed_events` tabela, TypeORM entity, migracija
- Worker integracija: parser se poziva pre markProcessed u processEvent()
- Backfill: BackfillService + CLI bootstrap + HTTP dev endpoint (`/api/processing/dev/backfill`)
- Backfill guard: odvojen token (`BACKFILL_TRIGGER_TOKEN`), feature flag (`ENABLE_BACKFILL`)
- Observability: `parse_result` structured log (status, event_type, confidence, device_id)
- Config validacija: `PARSER_VERSION`, `ENABLE_BACKFILL`, `BACKFILL_TRIGGER_TOKEN` u env.validation.ts

## Scope Excluded

- LLM/NLP pristup
- Geocoding i map API
- Public API izloženost parsed_events
- Promena worker claim/retry logike

## Commit Plan i Status

### ✅ COMMIT 1 — Parsing tipovi + migracija + entity
- `src/parsing/types.ts` — EventType, ParseStatus, ParsingContext, ParsingResult, ParsedEvent
- `src/database/migrations/1710350000000-CreateParsedEventsTable.ts`
- `src/database/parsed-event.entity.ts`
- `src/database/data-source.ts` + `database.module.ts` — dodati ParsedEventEntity

### ✅ COMMIT 2 — ParsingModule + ParsingService (rule engine)
- `src/parsing/parsing.module.ts`
- `src/parsing/parsing.service.ts`
  - `parseRawMessage(context): Promise<ParsingResult>`
  - `extractEventType(normalized): EventType`
  - `extractLocation(normalized, original): string | null`
  - `extractTime(normalized): Date | null`
  - `calculateConfidence(...): number`
  - `persistParsed(rawEventId, result): Promise<ParsedEvent>` — upsert
  - `parse_result` structured log za observability

### ✅ COMMIT 3 — 10 parser unit testova
- `test/parsing.e2e-spec.ts`
- Scenariji: police+lokacija, bez lokacije (no_match), radar, traffic_jam, accident+vreme, kratka poruka, multi-signal, confidence bounds, prazna poruka, non-Serbian

### ✅ COMMIT 4 — Worker integracija
- `src/processing/processing.service.ts` — parseRawMessage() + persistParsed() pre markProcessed
- `src/processing/processing.module.ts` — ParsingModule import

### ✅ COMMIT 5 — Worker e2e regression
- `test/processing.e2e-spec.ts` — ParsingService mock dodati

### ✅ COMMIT 6 — Backfill servis + CLI + HTTP endpoint
- `src/processing/backfill.service.ts`
  - `backfillProcessedEvents(options)` — batch replay sa ConfigService gate
  - `backfillByRawEventIds(ids)` — replay po ID lista
  - `findProcessedWithoutParsed(limit)` — count recovery query
  - `ensureEnabled()` — baca grešku kada ENABLE_BACKFILL=false
- `src/processing/backfill.bootstrap.ts` — CLI: `--mode processed|find-missing --limit=N --start=ISO`
- `src/processing/backfill.guard.ts` — `ProcessingBackfillGuard` sa zasebnim tokenom
- `src/processing/processing.controller.ts` — `POST /api/processing/dev/backfill`
- `src/processing/processing.module.ts` — BackfillService + BackfillGuard registrovani
- `package.json` — `start:backfill`, `start:backfill:dev` skripte

### ✅ COMMIT 7 — Config env vars + ažurirani testovi
- `src/config/env.validation.ts` — `PARSER_VERSION`, `ENABLE_BACKFILL`, `BACKFILL_TRIGGER_TOKEN`
- `test/backfill.e2e-spec.ts` — 6 testova, ConfigService mock, scenario: disabled flag
- `test/processing.e2e-spec.ts` — ProcessingBackfillGuard dodat u test module

**Test rezultati (COMMIT 7): 27/27 ✅**

### ✅ COMMIT 8 — HTTP endpoint e2e za backfill
- Dodat test za `POST /api/processing/dev/backfill` HTTP endpoint
- Scenario: backfill_enabled=true + valid token → 200 + replayed/errors count
- Scenario: backfill_enabled=false → 404
- Scenario: wrong token → 401
- `npm run build` uspešan (TypeScript compilation verifikacija)

**Test rezultati (COMMIT 8): 30/30 ✅ + build ✅**

### ✅ COMMIT 9 — Dokumentacija
- `README.md` — dodati sekciju "Parsing" sa: rule engine pregled, confidence heuristike, no_match semantika
- `README.md` — dodati sekciju "Backfill" sa: CLI komande runbook, HTTP endpoint primeri, env vars
- `docs/next_context_handoff.md` — finalni Phase 3B status, priprema za Phase 4
- `docker-compose.yml` ažuriran sa `PARSER_VERSION`, `ENABLE_BACKFILL`, `BACKFILL_TRIGGER_TOKEN` env vars u `api` i `worker`

**Finalni rezultati (Phase 3B): 30/30 tests ✅ + build ✅**

## Architecture Notes

### Confidence scoring formula
```
base = 0.0
+ 0.5  kada event_type detektovan (nije "unknown")
+ 0.25 kada lokacija detektovana
+ 0.15 kada vreme detektovano
+ 0.10 bonus za 2+ signala
─────────────────
MAX = 1.0 (capped)
threshold za "parsed" = 0.5
ispod = "no_match" (čuva se, ne triguje retry)
```

### Status matrica
| Worker status | Parse status | Opis |
|---|---|---|
| processed | parsed | Uspešno parsirano |
| processed | no_match | Parsirano ali bez dovoljno signala |
| failed | (nema) | Worker greškom pre parse |

### BackfillService operacioni modovi
| Mode | Endpoint | CLI flag | Token |
|---|---|---|---|
| Batch replay | POST /api/processing/dev/backfill | `--mode processed` | BACKFILL_TRIGGER_TOKEN |
| Recovery count | (direktan poziv) | `--mode find-missing` | BACKFILL_TRIGGER_TOKEN |
| ID-specific | (direktan poziv) | n/a | n/a |

## Env Variables Summary

| Var | Default | Opis |
|---|---|---|
| PARSER_VERSION | "v1.0" | Čuva se u parsed_events.parser_version |
| ENABLE_BACKFILL | "false" | Gate za BackfillService i HTTP endpoint |
| BACKFILL_TRIGGER_TOKEN | (required when enabled) | Bearer token za backfill endpoint |
| ENABLE_DEV_PROCESSING_TRIGGER | "false" | Gate za stari dev run-once endpoint |
| PROCESSING_DEV_TRIGGER_TOKEN | (required when enabled) | Bearer token za processing trigger |
