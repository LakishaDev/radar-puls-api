# Plan - Phase 3A Pending Event Worker

Date: 2026-03-12
Status: COMPLETE (2026-03-12)

## Goal

Uvesti odvojeni worker process koji obraduje raw events iz statusa pending sa idempotentnim claim mehanizmom, retry politikom 3 pokusaja i jasnim status tranzicijama.

## Locked Decisions

- WorkerMode: Odvojeni worker process.
- ProcessingGoal: Samo status flow bez parsera i geocoding-a u ovoj fazi.
- RetryPolicy: 3 pokusaja pa failed.
- Backoff: 30s, 2m, 10m.
- SelectionPolicy: FIFO po created_at, batch 100.
- Idempotency: Obavezna claim zastita i lease timeout.
- ManualTrigger: Ukljuciti dev-only rucni trigger za jedan batch run.

## Scope

Included:
- processing lifecycle
- retry i backoff
- worker servis i bootstrap
- dev-only manual trigger
- testovi i docker/runbook update

Excluded:
- NLP parser
- geocoding
- public map API
- Redis/Bull queue
- distributed orchestration

## Execution Plan

1. Prosiriti data model za processing lifecycle i retry metapodatke.
- Dodati: retry_count, next_retry_at, processing_started_at, processed_at, failed_at, last_error, processor_instance.
- Definisati status tok: pending -> processing -> processed ili failed.

2. Dodati migraciju i indekse za claim/retry upite.
- Fokus indeksa: processing_status + next_retry_at + created_at.

3. Prosiriti RawEventEntity i uskladiti ingest kompatibilnost.
- Ingest ostaje: processing_status=pending, retry_count=0, next_retry_at=null.

4. Implementirati claim algoritam sa idempotency pravilima.
- FIFO po created_at.
- Claim samo pending ili retry-ready.
- U claim koraku upisati processor_instance i processing_started_at.
- Spreciti dvostruki claim i dodati lease timeout za stuck processing.

5. Uvesti odvojeni worker bootstrap i ProcessingModule.
- Worker loop: claim -> process placeholder -> mark processed ili retry/fail.

6. Uvesti retry politiku (3 pokusaja).
- Attempt 1 fail -> +30s
- Attempt 2 fail -> +2m
- Attempt 3 fail -> +10m
- Posle treceg neuspeha -> failed + last_error

7. Dodati dev-only manual trigger (jedan batch run).
- Dostupan samo u development modu.
- Mora biti zasticen (auth/guard).

8. Konfigurisati scheduler/poller.
- Batch size: 100.
- Anti-overlap zastita jednog worker ciklusa.

9. Dodati observability.
- Log eventi: claim_started, claim_completed, process_success, process_retry, process_failed.
- Batch metrike: claimed_count, processed_count, failed_count, duration_ms.

10. Dodati testove.
- Unit: state tranzicije, retry kalkulacija, claim guard.
- Integracioni: batch flow i dev trigger.
- Regresija: ingest endpoint kontrakt ostaje nepromenjen.

11. Azzurirati operativne komande i dokumentaciju.
- package scripts za worker.
- docker compose workflow za worker servis.
- README runbook + troubleshooting.

## Candidate Files For Implementation

- src/database/raw-event.entity.ts
- src/database/migrations/<new_migration>.ts
- src/processing/processing.module.ts
- src/processing/processing.service.ts
- src/processing/processing.controller.ts (dev-only trigger)
- src/processing/worker.bootstrap.ts
- src/app.module.ts
- src/config/env.validation.ts
- package.json
- docker-compose.yml
- README.md
- test/processing.e2e-spec.ts
- test/processing.service.spec.ts

## Verification Checklist

- Migracije prolaze na cistoj bazi.
- Worker preuzima max 100 zapisa po ciklusu po FIFO created_at.
- Isti zapis nije claim-ovan dvaput.
- Retry radi tacno 30s, 2m, 10m i zatim failed.
- Dev trigger radi samo u development rezimu.
- Postojeci ingest testovi (200, 400, 401, 429, 500) i dalje prolaze.
- Docker lokalni setup dize API + worker bez claim konflikta.

## Risks and Mitigations

- Race conditions pri claim-u: koristiti atomican claim upit i status guard.
- Stuck processing status: lease timeout i reclaim pravilo.
- Scope creep: ne uvoditi parser/geocoding u ovoj fazi.

## Ready-to-Start Output

Po ovom planu implementacija moze krenuti odmah od migracije + entity update, zatim worker module i testovi.
