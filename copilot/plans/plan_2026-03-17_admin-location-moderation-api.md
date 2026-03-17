# Plan: Admin Location Moderation & Confirmation — API

**Datum:** 2026-03-17  
**Sinhronizovano sa:** `radar-puls-web/copilot/plans/plan_2026-03-17_admin-location-moderation-web.md`

---

## Cilj

Omogućiti adminu da:
1. **Potvrdi** AI-parsiranu lokaciju — čuva je u `geocoding_cache` kao verifikovan fallback za buduće evente
2. **Izmeni** sve relevantne podatke parsiranog eventa (lokacija, koordinate, tip, opis, sender…)
3. **Vidi** koordinate i Google Maps link za svaki event
4. **Prati** izvor podataka kroz status polja (`admin_edited`, `ai_raw`, `admin_confirmed`, itd.)

---

## Trenutno stanje

- `PATCH /api/admin/events/:id` — već podržava `eventType`, `locationText`, `senderName`, `description`
- `POST /api/admin/events/:id/approve` / `reject` — moderacija postoji
- `geocoding_cache` tabela ima `verified` boolean i `hit_count`
- Hardkodirani fallback-ovi u `LOCAL_FALLBACK_ENTRIES` (19 unosa za Niš)
- `ParsedEventEntity` ima `latitude`, `longitude`, `geo_source`, `moderation_status`
- Admin event detail vraća sve kolone iz `parsed_events` + `raw_events` JOIN

---

## Faze implementacije

### Faza 1: Proširenje `UpdateAdminEventDto` i API endpoint-a

**Fajl:** `src/admin/dto/update-admin-event.dto.ts`

Dodati nova polja u `UpdateAdminEventDto`:
```typescript
latitude?: number | null      // WGS84 koordinata
longitude?: number | null     // WGS84 koordinata
geoSource?: string | null     // 'admin' | zadržava postojeće
confidence?: number | null    // 0-100 skala
eventTime?: string | null     // ISO8601 timestamp
expiresAt?: string | null     // ISO8601 timestamp
```

Validacija:
- `latitude`: `@IsOptional()`, `@IsNumber()`, raspon -90 do 90
- `longitude`: `@IsOptional()`, `@IsNumber()`, raspon -180 do 180
- `confidence`: `@IsOptional()`, `@IsNumber()`, `@Min(0)`, `@Max(100)`
- `eventTime`: `@IsOptional()`, `@IsISO8601()`
- `expiresAt`: `@IsOptional()`, `@IsISO8601()`

**Fajl:** `src/admin/admin.service.ts` → `updateEvent()`

Proširiti SQL UPDATE da podrži nova polja. Kada admin menja `latitude`/`longitude`:
- Automatski setovati `geo_source = 'admin'`
- Setovati `moderation_status = 'approved'` (admin je ručno verifikovao)
- Setovati `moderated_by = 'admin'`, `moderated_at = NOW()`

Dodati `edit_source` tracking u odgovor:
- Vraćati `{ id, edit_source: 'admin_edited' }` kada admin menja podatke

---

### Faza 2: Novi endpoint — Potvrdi lokaciju (`confirm-location`)

**Fajl:** `src/admin/admin.controller.ts`

```typescript
@Post("/events/:id/confirm-location")
async confirmLocation(
  @Param("id") id: string,
  @Body() body: ConfirmLocationDto,
): Promise<{ id: string; cached: boolean }> {
  return this.adminService.confirmLocation(id, body);
}
```

**Novi DTO:** `src/admin/dto/confirm-location.dto.ts`

```typescript
class ConfirmLocationDto {
  @IsOptional()
  @IsNumber()
  @Min(-90) @Max(90)
  latitude?: number;        // Opciono — ako admin želi override

  @IsOptional()
  @IsNumber()
  @Min(-180) @Max(180)
  longitude?: number;       // Opciono — ako admin želi override

  @IsOptional()
  @IsString()
  @MaxLength(250)
  locationText?: string;    // Opciono — ako admin želi ispraviti tekst

  @IsOptional()
  @IsString()
  @MaxLength(120)
  confirmedBy?: string;     // Admin username
}
```

**Fajl:** `src/admin/admin.service.ts` → `confirmLocation()`

Logika:
1. Dohvatiti event po ID-u
2. Koristiti prosleđene lat/lng (ili postojeće iz eventa ako nisu prosleđeni)
3. Koristiti prosleđeni locationText (ili postojeći iz eventa)
4. Validacija: lat, lng i locationText moraju postojati (bilo iz eventa bilo iz body-ja)
5. **Upsert u `geocoding_cache`**:
   - `normalized_text` = normalizovani locationText
   - `lat`, `lng` = potvrđene koordinate
   - `verified = true`
   - `location_type = 'ADMIN_CONFIRMED'`
   - `formatted_addr` = locationText
   - `hit_count` += 1 (pri upsert-u)
6. **Update `parsed_events`**:
   - `geo_source = 'admin_confirmed'`
   - `latitude`, `longitude` = potvrđene vrednosti
   - `moderated_by`, `moderated_at = NOW()`
7. Publish realtime event

---

### Faza 3: Migracija — proširenje `geo_source` constraint-a

**Fajl:** `src/database/migrations/1710440000000-AddAdminGeoSource.ts`

```sql
-- Proširiti CHECK constraint na geo_source da uključi 'admin' i 'admin_confirmed'
ALTER TABLE parsed_events
  DROP CONSTRAINT IF EXISTS chk_parsed_events_geo_source;

ALTER TABLE parsed_events
  ADD CONSTRAINT chk_parsed_events_geo_source
  CHECK (geo_source IN (
    'fallback', 'nominatim', 'cache', 'google', 'google_partial',
    'admin', 'admin_confirmed'
  ));
```

Takođe dodati novo polje `edit_source` na `parsed_events`:

```sql
ALTER TABLE parsed_events
  ADD COLUMN IF NOT EXISTS edit_source TEXT
    DEFAULT 'ai_raw'
    CHECK (edit_source IN ('ai_raw', 'admin_edited', 'admin_confirmed', 'web_submitted'));
```

Backfill postojeće podatke:
```sql
UPDATE parsed_events SET edit_source = 'ai_raw' WHERE edit_source IS NULL;

-- Evente koji su bili ručno moderisani markirati
UPDATE parsed_events
  SET edit_source = 'admin_edited'
  WHERE moderated_at IS NOT NULL AND edit_source = 'ai_raw';
```

**Fajl:** `src/database/parsed-event.entity.ts`

Dodati novu kolonu:
```typescript
@Column({ name: "edit_source", type: "text", default: "ai_raw", nullable: true })
editSource: string | null;
```

---

### Faza 4: Proširiti getEventById odgovor

**Fajl:** `src/admin/admin.service.ts` → `getEventById()`

Dodati u SELECT:
- `pe.edit_source`
- Google Maps link se generiše na frontendu (ne na API-ju) ali API vraća `latitude` i `longitude` (već vraća)

Dodati u `listEvents()`:
- `pe.edit_source` u SELECT
- `pe.latitude`, `pe.longitude` (već vraća)

---

### Faza 5: Update `updateEvent()` — automatsko `edit_source` postavljanje

Kada admin pozove `PATCH /api/admin/events/:id`:
- Automatski setovati `edit_source = 'admin_edited'`
- Logovanje admin akcije

Kada admin pozove `POST /api/admin/events/:id/confirm-location`:
- Setovati `edit_source = 'admin_confirmed'`

Kada je event prvobitno kreiran od AI:
- Defaultni `edit_source = 'ai_raw'`

Kada je event kreiran sa web forme:
- `edit_source = 'web_submitted'`

---

### Faza 6: Proširiti admin stats

**Fajl:** `src/admin/admin.service.ts` → `getStats()`

Dodati nove metrike:
```sql
COUNT(*) FILTER (WHERE edit_source = 'admin_edited') AS admin_edited_count,
COUNT(*) FILTER (WHERE edit_source = 'admin_confirmed') AS admin_confirmed_count,
COUNT(*) FILTER (WHERE geo_source = 'admin' OR geo_source = 'admin_confirmed') AS admin_geo_count
```

**Fajl:** `src/admin/dto/admin-stats.dto.ts`

Dodati:
```typescript
admin_edited_count: number;
admin_confirmed_count: number;
admin_geo_count: number;
```

---

## Ne menjati (read-only / sistemska polja)

Sledeća polja admin **NE MOŽE** da menja:
- `id` — primarni ključ
- `raw_event_id` — veza sa sirovim eventom
- `parse_status` — sistemski (parser ga setuje)
- `enrich_status`, `enriched_at`, `enrich_attempts`, `enrich_next_retry_at` — enrichment pipeline
- `created_at` — timestamp kreiranja
- `upvotes`, `downvotes` — korisnički glasovi
- `parser_version` — verzija parsera
- Raw event kolone (source, group_name, raw_message, device_id, itd.)

---

## Predlozi za poboljšanje

1. **Admin Activity Log tabela** — Beležiti svaku admin akciju (ko, šta, kada, stare vs. nove vrednosti). Korisno za audit trail i rollback.

2. **Bulk confirm location** — Ako AI uvek parsira istu lokaciju sa istim koordinatama i ima 5+ ponavljanja, predložiti adminu bulk potvrdu.

3. **Geocoding cache admin UI** — Stranica sa svim cache unosima gde admin može da pregleda, briše ili izmeni keširane lokacije.

4. **Confidence threshold za auto-approve lokacija** — Umesto ručnog potvrđivanja svake lokacije, setovati prag (npr. confidence >= 90 i google geo_source) za automatsko dodavanje u cache.

5. **Location aliases** — Dozvoliti adminu da mapira više tekstova na istu lokaciju (npr. "kod kalkana", "kalkan", "Trg Kralja Aleksandra" → iste koordinate).

6. **Soft delete umesto hard reject** — Rejected eventi da ostanu u sistemu ali nevidljivi, sa mogućnošću restore-a.

---

## API Endpoint-i rezime

| Metoda | Ruta | Opis | Status |
|--------|------|------|--------|
| `PATCH` | `/api/admin/events/:id` | Izmeni event podatke (prošireno) | Postojeći → proširiti |
| `POST` | `/api/admin/events/:id/confirm-location` | Potvrdi lokaciju → sačuvaj u cache | **NOVO** |
| `GET` | `/api/admin/events/:id` | Detalji eventa (prošireno) | Postojeći → proširiti |
| `GET` | `/api/admin/events` | Lista evenata (prošireno) | Postojeći → proširiti |
| `GET` | `/api/admin/stats` | Statistike (prošireno) | Postojeći → proširiti |

---

## Fajlovi koji se menjaju

| Fajl | Vrsta promene |
|------|--------------|
| `src/admin/admin.controller.ts` | Novi endpoint `confirm-location` |
| `src/admin/admin.service.ts` | Nova metoda `confirmLocation()`, prošireni `updateEvent()`, `getEventById()`, `listEvents()`, `getStats()` |
| `src/admin/dto/update-admin-event.dto.ts` | Nova polja za koordinate, confidence, eventTime, expiresAt |
| `src/admin/dto/confirm-location.dto.ts` | **Novi fajl** |
| `src/admin/dto/admin-stats.dto.ts` | Nova polja za admin metrike |
| `src/admin/admin.module.ts` | Import GeocodingCacheEntity za confirm-location |
| `src/database/parsed-event.entity.ts` | Nova kolona `edit_source` |
| `src/database/migrations/1710440000000-AddAdminGeoSource.ts` | **Nova migracija** |
| `src/events/events.service.ts` | Setovati `edit_source='web_submitted'` za web reporte |
| `src/geocoding/geocoding.service.ts` | Expose `normalizeText()` za reuse u admin service |
