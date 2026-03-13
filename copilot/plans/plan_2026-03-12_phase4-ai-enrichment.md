# Plan - Phase 4: AI Enrichment Pipeline

Date: 2026-03-12
Status: PLANNED

## Goal

Zameniti nepredvidivi rule-based parser sa minimalnim rule engine-om (readable check + HH:MM vreme) i dodati odvojenu async AI fazu (`EnrichmentService`) koja poziva OpenAI GPT-4o-mini da izvuče ime pošiljaoca i lokaciju.

## Locked Decisions

- AIProvider: OpenAI GPT-4o-mini
- EnrichmentTiming: Odvojena async faza (ne blokira worker loop)
- SenderName: Da — dodati `sender_name` kolonu u `parsed_events`
- UnreadableText: Sačuvaj kao `no_match`, ne šalji AI-u
- EventType: Ostaje `unknown` u rule fazi; AI prompt može ga opciono vratiti
- RetryEnrichment: TBD od strane korisnika (opcija: `failed_at < now - 1h` auto-retry)

## Architecture

```
raw_events (pending)
    │
    ▼ worker (sinhrono, brzo)
  Rule engine:
    ├─ isReadableText()? NO  ──→ parse_status='no_match', enrich_status=null
    └─ YES
        ├─ extractTime() → \b(\d{1,2}):(\d{2})\b regex
        ├─ parse_status='parsed'
        └─ enrich_status='pending'  ──→ parsed_events (zapisano)
                                            │
                                            ▼ enrichment poller (async, odvojen proces)
                                       OpenAI GPT-4o-mini
                                       structured output prompt
                                            │
                                       UPDATE parsed_events SET
                                         sender_name, location_text,
                                         enrich_status='enriched',
                                         enriched_at=now
```

## Poruka struktura (user input)

Poruke imaju predvidivu strukturu:
- **Ime pošiljaoca** — uvek na početku
- **Lokacija** — slobodan tekst
- **Vreme** — uvek format `HH:MM` (npr. `09:12`, `13:08`)

Rule engine detektuje i upisuje vreme (predvidivo). AI detektuje ime i lokaciju (slobodan tekst).

## Commit Plan

### ❌ COMMIT 1 — DB schema + entity

1. Nova migracija: dodati u `parsed_events`:
   - `sender_name TEXT NULL`
   - `enrich_status TEXT CHECK('pending','enriched','failed') NULL`
   - `enriched_at TIMESTAMPTZ NULL`
   - Indeks na `(enrich_status, created_at)` za poller query
2. Ažurirati `src/database/parsed-event.entity.ts` sa novim kolonama
3. Dodati `EnrichStatus` tip u `src/parsing/types.ts`

### ❌ COMMIT 2 — Simplifikacija rule engine-a

4. Izmeniti `src/parsing/parsing.service.ts`:
   - Dodati `isReadableText(raw): boolean`:
     - min 3 znaka
     - ≥50% unicode slova/razmaci → ne: `parse_status='no_match'`, `enrich_status=null`
   - `extractTime()`: svesti na jedan direktni regex `\b(\d{1,2}):(\d{2})\b`
   - Ukloniti: `extractEventType()`, `extractLocation()`, `calculateConfidence()`, `generateDescription()`
   - `parseRawMessage()` vraća: `status`, `event_time`, `enrich_status`
   - `event_type` = `'unknown'` uvek (AI popunjava opciono)
5. Ažurirati `src/parsing/types.ts`: ukloniti `EVENT_TYPE_KEYWORDS`, `LOCATION_KEYWORDS`, stare `TIME_PATTERNS`, `CONFIDENCE_THRESHOLDS`
6. Ažurirati `test/parsing.e2e-spec.ts`: novi test set za:
   - readable check (valid / nevalid)
   - time extraction (`09:12`, `13:08`, `7:05`, bez vremena)
   - `enrich_status` vrednosti

### ❌ COMMIT 3 — EnrichmentService + Module + Bootstrap

7. `src/enrichment/enrichment.service.ts`:
   - `pollAndEnrich(limit)`: query `parsed_events WHERE enrich_status='pending' LIMIT N ORDER BY created_at ASC`
   - `enrichEvent(parsedEvent)`: poziva OpenAI, prompt vraća `{senderName, locationText, eventType?}` kao JSON
   - Na uspeh: UPDATE `sender_name`, `location_text`, `event_type` (ako AI vrati), `enrich_status='enriched'`, `enriched_at=now`
   - Na grešku: UPDATE `enrich_status='failed'` (log error, ne throw)
8. `src/enrichment/enrichment.module.ts`
9. `src/enrichment/enrichment.bootstrap.ts` — interval poller, isti pattern kao `worker.bootstrap.ts`

#### OpenAI prompt dizajn

```
System:
  Ti si asistent koji ekstrahuje strukturirane podatke iz srpskih Viber poruka
  o saobraćajnim događajima. Poruka uvek počinje imenom pošiljaoca, zatim
  opisom lokacije, a može sadržavati vreme u HH:MM formatu.
  Vrati ISKLJUČIVO JSON u formatu:
  {"senderName": string, "locationText": string, "eventType": "police"|"accident"|"traffic_jam"|"radar"|"control"|"unknown"}

User:
  <rawMessage>
```

### ❌ COMMIT 4 — Config + Docker + package.json

10. `src/config/env.validation.ts`: dodati:
    - `OPENAI_API_KEY` (required)
    - `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
    - `ENRICHMENT_POLL_INTERVAL_MS` (optional, default `10000`)
    - `ENRICHMENT_BATCH_SIZE` (optional, default `10`)
11. `docker-compose.yml`: dodati `enrichment` servis:
    - isti image kao `worker`
    - `npm run start:enrichment:dev`
    - `depends_on: api: service_healthy`
    - env: `OPENAI_API_KEY`, `OPENAI_MODEL`, `ENRICHMENT_POLL_INTERVAL_MS`, `ENRICHMENT_BATCH_SIZE`
12. `package.json`: `start:enrichment`, `start:enrichment:dev`
13. `npm install openai`

### ❌ COMMIT 5 — Testovi + regression

14. `test/enrichment.e2e-spec.ts`:
    - Mock OpenAI client
    - `pollAndEnrich` flow: success, AI failure, field mapping
    - Verifikacija da se `enrich_status` ažurira ispravno
15. Regression: processing i backfill testovi prolaze bez promena
16. `npm run build` verifikacija

### ❌ COMMIT 6 — Dokumentacija

17. `README.md`: sekcija "Enrichment" (pipeline dijagram, env vars, `start:enrichment:dev` runbook)
18. `.env` + `docker-compose.yml`: `OPENAI_API_KEY=` placeholder
19. Ažurirati `docs/next_context_handoff.md`

## Env Variables Summary

| Var | Default | Opis |
|---|---|---|
| `OPENAI_API_KEY` | (required) | OpenAI API ključ |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model koji se koristi |
| `ENRICHMENT_POLL_INTERVAL_MS` | `10000` | Interval između enrichment batch-eva |
| `ENRICHMENT_BATCH_SIZE` | `10` | Broj `pending` zapisa po batch-u |

## DB Schema Delta (parsed_events)

| Nova kolona | Tip | Default | Opis |
|---|---|---|---|
| `sender_name` | TEXT NULL | — | Ime pošiljaoca (AI) |
| `enrich_status` | TEXT NULL CHECK | — | `pending` / `enriched` / `failed` |
| `enriched_at` | TIMESTAMPTZ NULL | — | Kada je AI obogatio zapis |

## Verification Checklist

- [ ] `npm run test:e2e` — svi testovi prolaze (ciljamo ~35)
- [ ] `npm run build` — TypeScript bez grešaka
- [ ] `docker compose ps` — `db`, `api`, `worker`, `enrichment` svi `Up`
- [ ] Manuelni test: `curl POST /api/events/viber` → `raw_events.processing_status='processed'` → `parsed_events.parse_status='parsed'`, `enrich_status='enriched'`, `sender_name` i `location_text` popunjeni

## Open Questions

- **Retry za enrichment**: Ako `enrich_status='failed'`, auto-retry posle `N` minuta ili ručno? (TBD)
- **event_type iz AI-a**: Prompt vraća `eventType` kao bonus — prihvatiti ili ignorisati?

## Further Considerations

- `gpt-4o-mini` je ~$0.0001/poruka — `ENRICHMENT_BATCH_SIZE=10` default drži development troškove pod kontrolom
- `confidence` kolona ostaje u shemi za backward compatibilnost (vrednost `0` za sve rule-only rezultate)
- Stari keyword/location testovi se zamenjuju — nema korisnosti testirati kod koji se briše
- `BackfillService` ostaje nepromenjen — replay-uje rule fazu; enrichment poller automatski pokupi backfill rezultate sa `enrich_status='pending'`
