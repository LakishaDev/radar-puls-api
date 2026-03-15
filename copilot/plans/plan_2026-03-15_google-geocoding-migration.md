# Plan: Migracija sa Nominatim na Google Geocoding API

**Datum:** 2026-03-15  
**Status:** PLANIRAN  
**Prioritet:** Visok

---

## 1. Motivacija

Nominatim (OpenStreetMap) ima ograničenja:
- Nema pouzdan partial match za srpske lokacije (ulice, kvartove, lokalne nazive)
- Rate limit od 1 req/s (delay od 1100ms u kodu)
- Manja preciznost za balkanske lokacije

Google Geocoding API nudi:
- **Partial match** — automatski vraca `partial_match: true` kada ne pronadje tacan, ali pronadje delimican rezultat
- **Viewport biasing** — moze se ograniciti na Nis/Srbiju za preciznije rezultate
- **Region biasing** (`region=rs`) — preferira rezultate iz Srbije
- **Component filtering** (`components=country:RS`) — striktno ogranicava na Srbiju
- **location_type** polje (`ROOFTOP`, `RANGE_INTERPOLATED`, `GEOMETRIC_CENTER`, `APPROXIMATE`) — daje informaciju o preciznosti
- Znacajno veci dataset za Srbiju

---

## 2. Pregled trenutnog stanja

### Backend (radar-puls-api)

**Fajlovi koji se menjaju:**

| Fajl | Sta se menja |
|------|-------------|
| `src/geocoding/geocoding.service.ts` | Glavna logika — zamena Nominatim poziva sa Google, dodavanje partial match logike, dodavanje DB cache sistema |
| `src/geocoding/geocoding.module.ts` | Dodavanje TypeORM importa za novu tabelu |
| `src/database/parsed-event.entity.ts` | Prosirenje `geoSource` tipa sa novim vrednostima |
| `src/events/dto/map-event.dto.ts` | Prosirenje `geoSource` tipa |
| `src/events/events.service.ts` | Prosirenje `geoSource` tipa u query-ju |
| `src/config/env.validation.ts` | Zamena `NOMINATIM_USER_AGENT` sa `GOOGLE_GEOCODING_API_KEY` |
| `test/geocoding.e2e-spec.ts` | Azuriranje testova |
| `.env.production.example` | Azuriranje env primera |
| Nova migracija | Kreiranje `geocoding_cache` tabele + update `geo_source` kolone |

---

## 3. Arhitektura novog sistema

### 3.1 Hijerarhija geocoding izvora (prioritet)

```
1. LOCAL_FALLBACK (hardkodirane lokacije) — source: "fallback"
2. DB CACHE (verified lokacije sa ≥5 upvotova) — source: "cache"  
3. GOOGLE GEOCODING API — source: "google" ili "google_partial"
```

### 3.2 Nova tabela: `geocoding_cache`

```sql
CREATE TABLE geocoding_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_text   TEXT NOT NULL,            -- originalni tekst lokacije
  normalized_text TEXT NOT NULL UNIQUE,      -- normalizovan tekst (lowercase, bez dijakritika)
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  is_partial      BOOLEAN NOT NULL DEFAULT false,  -- da li je bio partial match
  location_type   TEXT,                     -- ROOFTOP, APPROXIMATE, itd.
  formatted_addr  TEXT,                     -- formatted_address iz Google odgovora
  place_id        TEXT,                     -- Google place_id za referencu
  hit_count       INT NOT NULL DEFAULT 1,   -- koliko puta je pogodjen
  verified        BOOLEAN NOT NULL DEFAULT false,  -- da li je verifikovan (≥5 upvotova)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geocoding_cache_normalized ON geocoding_cache(normalized_text);
CREATE INDEX idx_geocoding_cache_verified ON geocoding_cache(verified) WHERE verified = true;
```

### 3.3 Logika keširanja i verifikacije

```
geocodeLocation(locationText):
  1. Normalizuj tekst
  2. Proveri LOCAL_FALLBACK → vrati ako nadje
  3. Proveri DB CACHE (samo verified=true) → vrati ako nadje (source: "cache")
  4. Proveri DB CACHE (verified=false) → vrati ako nadje, ali oznaci source kao "google_partial" ili "google"
  5. Pozovi Google Geocoding API
     - Ako vrati rezultat:
       a. Sacuvaj u geocoding_cache tabelu (upsert po normalized_text)
       b. Ako partial_match=true → is_partial=true, source="google_partial"
       c. Ako partial_match=false → is_partial=false, source="google"
     - Ako ne vrati → return null
```

### 3.4 Mehanizam verifikacije putem upvotova

Periodicno (ili event-driven), sistem proverava parsed_events:
- Ako lokacija ima kumulativno **≥5 net upvotova** (upvotes - downvotes) iz razlicitih dogadjaja sa istim `normalized_text`
- Postavi `verified = true` u `geocoding_cache`
- Sledeci put, ta lokacija se direktno koristi iz cache-a bez pozivanja Google API-ja

**Implementacija:**
- Dodati metodu `promoteVerifiedLocations()` u GeocodingService
- Pokretati je kao deo enrichment ciklusa (posle svakog batcha) ili kao zaseban cron/interval
- Query:
  ```sql
  UPDATE geocoding_cache gc
  SET verified = true, updated_at = NOW()
  WHERE gc.verified = false
    AND EXISTS (
      SELECT 1 FROM parsed_events pe
      WHERE normalize(pe.location_text) = gc.normalized_text
        AND (pe.upvotes - pe.downvotes) >= 5
    );
  ```

### 3.5 GeoResult — prosireni tip

```typescript
export type GeoSource = "fallback" | "cache" | "google" | "google_partial";

export type GeoResult = {
  lat: number;
  lng: number;
  source: GeoSource;
  isPartialMatch: boolean;  // novo — da li je partial match
  confidence: "high" | "medium" | "low";  // novo — confidence na osnovu location_type
  formattedAddress?: string;  // optional — formatted_address iz Google-a
};
```

**Mapiranje confidence:**
- `ROOFTOP` → `"high"`
- `RANGE_INTERPOLATED` → `"medium"`
- `GEOMETRIC_CENTER` → `"medium"`
- `APPROXIMATE` → `"low"`
- fallback/cache → `"high"` (jer su verifikovane)

---

## 4. Google Geocoding API integracija — detalji

### 4.1 Request format

```
GET https://maps.googleapis.com/maps/api/geocode/json
  ?address={locationText}, Niš, Serbia
  &key={GOOGLE_GEOCODING_API_KEY}
  &region=rs
  &language=sr
  &bounds=43.25,21.80|43.40,22.00     // viewport bias za siri Nis
  &components=country:RS
```

### 4.2 Response parsing

```typescript
interface GoogleGeoResponse {
  status: "OK" | "ZERO_RESULTS" | "OVER_QUERY_LIMIT" | "REQUEST_DENIED" | "INVALID_REQUEST" | "UNKNOWN_ERROR";
  results: Array<{
    formatted_address: string;
    geometry: {
      location: { lat: number; lng: number };
      location_type: "ROOFTOP" | "RANGE_INTERPOLATED" | "GEOMETRIC_CENTER" | "APPROXIMATE";
    };
    partial_match?: boolean;
    place_id: string;
    types: string[];
  }>;
  error_message?: string;
}
```

### 4.3 Error handling

| Status | Akcija |
|--------|--------|
| `OK` | Parsiraj rezultat |
| `ZERO_RESULTS` | return null (nema poklapanja) |
| `OVER_QUERY_LIMIT` | Log warning, return null, razmotriti retry sa delay-em |
| `REQUEST_DENIED` | Log error (lose konfigurisan API key) |
| `INVALID_REQUEST` | Log warning |
| `UNKNOWN_ERROR` | Log warning, return null |

### 4.4 Rate limiting

Google Geocoding API dozvoljava 50 req/s (default quota). Za razliku od Nominatim-a (1 req/s), nije potreban delay izmedju poziva. Ipak:

- Ukloniti `nominatimDelayMs` (1100ms delay)
- Dodati opcionu env varijablu `GOOGLE_GEOCODING_DELAY_MS` za slucaj da treba throttling (default: 0)
- Zadrzati timeout od 5000ms za fetch

---

## 5. Promene env konfiguracije

### Uklanja se:
```
NOMINATIM_USER_AGENT=radar-puls-api/1.0 (contact: ops@your-domain.tld)
```

### Dodaje se:
```
GOOGLE_GEOCODING_API_KEY=AIza...        # Obavezno
GOOGLE_GEOCODING_DELAY_MS=0             # Opciono, default 0
GEO_ENABLED=true                        # Ostaje isto
```

### env.validation.ts promene:
- Obrisati `NOMINATIM_USER_AGENT`
- Dodati `GOOGLE_GEOCODING_API_KEY` (required, @IsString)
- Dodati `GOOGLE_GEOCODING_DELAY_MS` (optional, @IsInt, @Min(0))

---

## 6. Migracija baze

### 6.1 Nova migracija: `XXXXXX-google-geocoding-cache.ts`

```sql
-- Kreiranje geocoding_cache tabele
CREATE TABLE geocoding_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_text   TEXT NOT NULL,
  normalized_text TEXT NOT NULL UNIQUE,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  is_partial      BOOLEAN NOT NULL DEFAULT false,
  location_type   TEXT,
  formatted_addr  TEXT,
  place_id        TEXT,
  hit_count       INT NOT NULL DEFAULT 1,
  verified        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geocoding_cache_normalized ON geocoding_cache(normalized_text);
CREATE INDEX idx_geocoding_cache_verified ON geocoding_cache(verified) WHERE verified = true;

-- Azuriranje geo_source kolone da prihvata nove vrednosti
-- (Kolona je vec TEXT tip, ne treba ALTER, ali dokumentujemo nove validne vrednosti)
-- Validne vrednosti: 'fallback', 'cache', 'google', 'google_partial'
-- Stara vrednost 'nominatim' ostaje za postojece redove (backward compatibility)
```

### 6.2 Nova entity: `geocoding-cache.entity.ts`

```typescript
@Entity({ name: "geocoding_cache" })
export class GeocodingCacheEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "text", name: "location_text" }) locationText!: string;
  @Column({ type: "text", name: "normalized_text", unique: true }) normalizedText!: string;
  @Column({ type: "double precision" }) lat!: number;
  @Column({ type: "double precision" }) lng!: number;
  @Column({ type: "boolean", name: "is_partial", default: false }) isPartial!: boolean;
  @Column({ type: "text", name: "location_type", nullable: true }) locationType!: string | null;
  @Column({ type: "text", name: "formatted_addr", nullable: true }) formattedAddr!: string | null;
  @Column({ type: "text", name: "place_id", nullable: true }) placeId!: string | null;
  @Column({ type: "int", name: "hit_count", default: 1 }) hitCount!: number;
  @Column({ type: "boolean", default: false }) verified!: boolean;
  @CreateDateColumn({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" }) updatedAt!: Date;
}
```

---

## 7. Azuriranje GeocodingService — pseudokod

```typescript
@Injectable()
export class GeocodingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    @InjectRepository(GeocodingCacheEntity)
    private readonly cacheRepo: Repository<GeocodingCacheEntity>,
  ) {
    this.apiKey = this.configService.getOrThrow<string>("GOOGLE_GEOCODING_API_KEY");
    this.geoEnabled = this.getBoolean("GEO_ENABLED", true);
    this.delayMs = Number(this.configService.get("GOOGLE_GEOCODING_DELAY_MS") ?? 0);
  }

  async geocodeLocation(locationText: string): Promise<GeoResult | null> {
    const normalized = normalizeText(locationText);
    if (!normalized) return null;

    // 1. Lokalni fallback
    const fallback = this.findFallback(normalized);
    if (fallback) return fallback;

    if (!this.geoEnabled) return null;

    // 2. DB cache (verified first)
    const cached = await this.findCached(normalized);
    if (cached) return cached;

    // 3. Google Geocoding API
    return this.geocodeWithGoogle(locationText, normalized);
  }

  private async findCached(normalized: string): Promise<GeoResult | null> {
    const entry = await this.cacheRepo.findOne({ where: { normalizedText: normalized } });
    if (!entry) return null;
    
    // Increment hit count
    await this.cacheRepo.increment({ id: entry.id }, "hitCount", 1);

    return {
      lat: entry.lat,
      lng: entry.lng,
      source: entry.verified ? "cache" : (entry.isPartial ? "google_partial" : "google"),
      isPartialMatch: entry.isPartial,
      confidence: entry.verified ? "high" : this.mapConfidence(entry.locationType),
    };
  }

  private async geocodeWithGoogle(locationText: string, normalized: string): Promise<GeoResult | null> {
    // ... fetch Google API, parse, upsert u cache ...
  }

  async promoteVerifiedLocations(): Promise<number> {
    // Promovisati lokacije sa ≥5 net upvotova u verified
    // Vratiti broj promovisanih
  }
}
```

---

## 8. Partial match logika

Google Geocoding API automatski vraca `partial_match: true` u response-u. To koristimo za:

### Na backendu:
- Cuvamo `is_partial` flag u `geocoding_cache`
- Postavljamo `source` na `"google_partial"` umesto `"google"`
- Confidence se mapira na osnovu `location_type`:
  - Partial match + APPROXIMATE → `"low"`
  - Partial match + GEOMETRIC_CENTER → `"low"`
  - Partial match + ROOFTOP → `"medium"` (redak slucaj)

### Za frontend:
- `geoSource` polje u API response-u ce nositi `"google_partial"` vrednost
- Frontend moze prikazati indikator da lokacija nije 100% sigurna
- Marker moze imati drukciji stil (npr. isprekidana ivica, manja opacnost)

---

## 9. Koraci implementacije (redosled)

### Faza 1: Baza i entitet
- [ ] Kreirati `src/database/geocoding-cache.entity.ts`
- [ ] Kreirati migraciju za `geocoding_cache` tabelu
- [ ] Registrovati entity u `database.module.ts`

### Faza 2: Env i konfiguracija
- [ ] Azurirati `env.validation.ts` — dodati `GOOGLE_GEOCODING_API_KEY`, ukloniti `NOMINATIM_USER_AGENT`
- [ ] Azurirati `.env.production.example`
- [ ] Azurirati Docker/compose env ako treba

### Faza 3: GeocodingService refaktor
- [ ] Azurirati `GeoSource` tip — dodati `"cache"`, `"google"`, `"google_partial"`
- [ ] Prosiriti `GeoResult` tip sa `isPartialMatch`, `confidence`
- [ ] Implementirati `findCached()` metodu
- [ ] Implementirati `geocodeWithGoogle()` metodu (zamena za `geocodeWithNominatim()`)
- [ ] Implementirati `promoteVerifiedLocations()` metodu
- [ ] Ukloniti Nominatim-specfican kod (`nominatimDelayMs`, `userAgent`)
- [ ] Azurirati `geocoding.module.ts` — dodati TypeORM import za cache entity

### Faza 4: Azuriranje tipova u sistemu
- [ ] Azurirati `parsed-event.entity.ts` — prosiriti `geoSource` tip
- [ ] Azurirati `map-event.dto.ts` — prosiriti `geoSource` tip
- [ ] Azurirati `events.service.ts` — prosiriti query tip

### Faza 5: Verifikacija integracija
- [ ] Dodati poziv `promoteVerifiedLocations()` u enrichment ciklus
- [ ] Ili kreirati zaseban interval/cron za promociju

### Faza 6: Testiranje
- [ ] Azurirati `test/geocoding.e2e-spec.ts`
- [ ] Dodati testove za cache logiku
- [ ] Dodati testove za partial match
- [ ] Dodati testove za promociju lokacija
- [ ] E2E test sa pravim Google API pozivom (staging)

### Faza 7: Deploy
- [ ] Postaviti `GOOGLE_GEOCODING_API_KEY` u production env
- [ ] Pokrenuti migraciju
- [ ] Deploy i monitoring

---

## 10. Bezbednosne napomene

- **API key zastititi** — koristiti env varijablu, nikad hardkodirati
- **Ograniciti API key** u Google Cloud Console:
  - Dozvoliti samo Geocoding API
  - Ograniciti po IP adresi servera
- **Budget alert** — postaviti budget u Google Cloud za Geocoding API
- **Ne logirati API key** — nikada u log output
- **Sanitizacija inputa** — location text vec prolazi normalizaciju, ali proveriti da nema injection pokusaja u URL parametrima (koristiti `encodeURIComponent` ili `URLSearchParams`)

---

## 11. Troskovi

Google Geocoding API pricing (mart 2026):
- **$5 po 1000 request-a** (iznad free tier-a)
- Free tier: **$200 mesecno** (40,000 req/mesecno besplatno)
- Sa cache sistemom, ocekivani trosak bi bio minimalan jer ce se vecina lokacija keirati posle prvog poziva
- Verifikovane lokacije (≥5 upvotova) nikada vise ne pozivaju Google API

---

## 12. Rollback plan

Ako Google API ne radi kako treba:
1. Promeniti `GEO_ENABLED=false` u env → koristi se samo fallback
2. Ili dodati env flag `GEOCODING_PROVIDER=nominatim|google` za brzo prebacivanje
3. Zadrzati stari Nominatim kod u grani za 30 dana pre brisanja
