# Plan - Phase 5: Geocoding (Pin na mapi)

Date: 2026-03-12
Status: PLANNED

## Goal

Proširiti enrichment pipeline sa automatskim geocodingom — nakon što AI izuvce `locationText`, odmah geokodirati tu lokaciju i upisati `latitude`, `longitude` u bazu. Frontend može direktno koristiti koordinate za crtanje pina na mapi bez ikakve dodatne obrade.

## Locked Decisions

- **GeocodingTiming**: Odmah posle AI ekstrakcije, u istom `enrichEvent()` pozivu
- **GeocodingProvider**: Nominatim (OpenStreetMap) — besplatan, bez API ključa
- **LocalFallback**: Statički rečnik niških fraza pre Nominatim poziva (npr. "kod Kalkana" → koordinate Kalkana)
- **CityBias**: Svaki Nominatim upit se šalje sa `city=Niš, Serbia` biasom da smanji greške
- **NullOnFail**: Ako geocoding ne uspe (nepoznata lokacija, timeout), `lat/lng` ostaju `null` — event se i dalje smatra `enriched`
- **GeoSource**: Kolona `geo_source TEXT` prati odakle su koordinate: `'fallback'`, `'nominatim'`, `null`
- **RateLimit**: Nominatim zahteva max 1 req/s — dodati `sleep(1100ms)` između poziva ili queue

## Arhitektura

```
EnrichmentService.enrichEvent()
    │
    ├─ extractStructuredData()  ← AI (već postoji)
    │      └─ { senderName, locationText, eventType }
    │
    ├─ geocodeLocation(locationText)  ← NOVO
    │      │
    │      ├─ 1. Proveri LOCAL_FALLBACK recnik
    │      │       └─ matched? → { lat, lng, source: 'fallback' }
    │      │
    │      └─ 2. Nominatim API
    │              └─ { lat, lng, source: 'nominatim' } ili null
    │
    └─ UPDATE parsed_events SET
           latitude, longitude, geo_source,
           sender_name, location_text, event_type,
           enrich_status='enriched', enriched_at
```

## DB Schema (nova polja)

```sql
ALTER TABLE parsed_events
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS geo_source TEXT NULL;
  -- geo_source CHECK: 'fallback', 'nominatim'
```

Nema potrebe za indeksom na koordinatama za sada (čita ih frontend direktno po ID-u ili vremenskom opsegu).

## Local Fallback Rečnik (Niš i okolina)

Statički `Map<string, {lat, lng}>` — string match je case-insensitive, tokenizovana fraza:

| Fraza (ključne reči) | Lokacija | Koordinate (approx) |
|---|---|---|
| `kalkan`, `kod kalkana` | Kalkan pijaca | 43.3203, 21.8958 |
| `bulevar`, `bulevar nemanjića` | Bulevar Nemanjića | 43.3237, 21.8960 |
| `bulevar medijana` | Bulevar Medijana | 43.3200, 21.9100 |
| `medijana` | Medijana | 43.3180, 21.9150 |
| `palilula` | Palilula | 43.3330, 21.9060 |
| `pantelej` | Pantelej | 43.3070, 21.9300 |
| `čair`, `cair` | Čair | 43.3260, 21.9060 |
| `tvrđava`, `tvrdava`, `niska tvrdjava` | Niška tvrđava | 43.3215, 21.9005 |
| `jagodicka`, `jagodička` | Jagodinačka ulica | 43.3300, 21.9120 |
| `vojvode tankosića`, `tankosica` | Vojvode Tankosića | 43.3190, 21.8960 |
| `kopitareva`, `kopitareva česma` | Kopitareva česma | 43.3150, 21.8910 |
| `sajam`, `niški sajam` | Niški Sajam | 43.3090, 21.9050 |
| `niška banja`, `banja` | Niška Banja | 43.2950, 22.0100 |
| `sićevo`, `sicevo` | Sićevo | 43.3600, 22.0700 |
| `leskovački put` | Leskovački put | 43.2920, 21.8970 |
| `beogradska`, `beogradski put` | Beogradski put | 43.3380, 21.8880 |
| `brzi put`, `obilaznca`, `obilaznica` | Niška obilaznica | 43.3000, 21.8700 |
| `zeleni venac` | Zeleni venac | 43.3225, 21.8990 |

Fraze se poklapaju ako `locationText.toLowerCase()` sadrži ključnu reč. Sortirati od najspecifičnijih ka najopštijim (dulji match ima prioritet).

## Nominatim Poziv

```
GET https://nominatim.openstreetmap.org/search
  ?q={locationText}, Niš, Serbia
  &format=json
  &limit=1
  &countrycodes=rs
  &accept-language=sr,en

User-Agent: radar-puls-api/1.0 (contact: <email>)
```

Nominatim zahteva `User-Agent` header sa kontakt info — bez njega može blokirati.

Parsiranje odgovora:
- `response[0].lat` / `response[0].lon` → sačuvati kao `DOUBLE PRECISION`
- Ako `response` prazan ili timeout (5s) → `lat=null`, `lng=null`, `geo_source=null`

## Rate Limiting

Nominatim Policy: **max 1 req/s**.

Rešenje: `EnrichmentService` procesira evente sekvencijalno (već radi), dodati `await sleep(1100)` posle svakog Nominatim poziva. Fallback hit ne čeka.

## API Endpoint za mapu

Novi endpoint: `GET /api/events/map`

Response format:
```json
[
  {
    "id": "uuid",
    "eventType": "control",
    "locationText": "Bulevar Nemanjića",
    "senderName": null,
    "eventTime": "2026-03-12T22:25:00Z",
    "lat": 43.3237,
    "lng": 21.8960,
    "geoSource": "fallback",
    "rawMessage": "bulevar duvaljka"
  }
]
```

Query parametri:
- `?since=ISO8601` — filtriraj od datuma (default: poslednjih 24h)
- `?eventType=control,police` — filtriraj po tipu
- `?geoOnly=true` — vrati samo rekorde koji imaju `lat IS NOT NULL` (default: true)

Auth: isti `Bearer` token kao za ingest (ili novi read-only token — TBD).

## Commit Plan

### COMMIT 1 — DB schema + entity

- Nova migracija: `1710370000000-AddGeoFieldsToParsedEvents.ts`
  - `latitude DOUBLE PRECISION NULL`
  - `longitude DOUBLE PRECISION NULL`
  - `geo_source TEXT NULL`
- Ažurirati `ParsedEventEntity` sa 3 nova polja

### COMMIT 2 — GeocodingService

- Novi fajl: `src/geocoding/geocoding.service.ts`
  - `geocodeLocation(locationText: string): Promise<GeoResult | null>`
  - `LOCAL_FALLBACK` mapa (sve niške fraze)
  - Nominatim HTTP poziv sa `axios` (već u projektu kao NestJS `HttpModule`) ili native `fetch`
  - `sleep(1100ms)` rate limit za Nominatim
- Novi fajl: `src/geocoding/geocoding.module.ts`
- Tip: `GeoResult = { lat: number; lng: number; source: 'fallback' | 'nominatim' }`

### COMMIT 3 — Integracija u EnrichmentService

- Uvesti `GeocodingModule` u `EnrichmentModule`
- Proširiti `enrichEvent()`:
  - Poziv `geocodingService.geocodeLocation(extraction.locationText)` posle AI ekstrakcije
  - UPDATE dodati `latitude=$5, longitude=$6, geo_source=$7`
- Null safety: ako `locationText === null`, preskočiti geokodiranje

### COMMIT 4 — Map API endpoint

- `src/events/events.controller.ts`: novi `GET /api/events/map` handler
- `src/events/events.service.ts`: `getMapEvents(since?, eventType?, geoOnly?)` metoda
  - SQL: `SELECT ... WHERE enriched_at IS NOT NULL AND ($geoOnly IS FALSE OR latitude IS NOT NULL)`
- DTO: `MapEventDto` sa svim mapskim poljima

### COMMIT 5 — Env, Docker, testovi

- `env.validation.ts`: dodati `NOMINATIM_USER_AGENT` (required string), `GEO_ENABLED` (optional bool, default true)
- `docker-compose.yml`: dodati `NOMINATIM_USER_AGENT` u api + enrichment servis
- Unit testovi za `GeocodingService`:
  - fallback match (bulevar, kalkan)
  - fallback prioritet ispred Nominatim
  - Nominatim success path (mock axios)
  - Nominatim timeout → null
- E2E test: `test/geocoding.e2e-spec.ts` — spy na Nominatim, assert lat/lng upisani posle enrichment ciklusa
- E2E test: `test/events-map.e2e-spec.ts` — GET /api/events/map response shape

## Open Questions

- **Auth za map endpoint**: isti device token il novi read-only token?
- **Stari enriched rekodi**: re-geocodirati postojece `enriched` rekorde retroaktivno, ili samo novi?
- **Fallback rečnik**: da li čuvati u kodu (statički) ili u posebnoj JSON konfiguracionoj tabeli u bazi?
- **Mapbox/Google umesto Nominatim**: bolji rezultati za srpske lokacije, ali zahtevaju API ključ i naplativi su

## Zavisnosti

- Nema novih npm paketa (koristiti native `fetch` koji dolazi sa Node.js 18+)
- Nominatim je besplatan i javno dostupan, nema potrebe za API ključem
