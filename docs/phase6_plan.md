# Phase 6 — Mapa i Admin Panel

Datum: 2026-03-13  
Status: Plan  

---

## Pregled stanja

### Šta web (radar-puls-web) već ima

| Funkcionalnost | Status | Detalji |
|---|---|---|
| Leaflet mapa | ✅ Demo | `components/landing/map-client.tsx`, statički `data/markers.json` (7 hardkodovanih markera za Niš) |
| Marker tipovi | ✅ Parcijalno | police, radar, checkpoint — **nedostaju**: accident, traffic_jam, unknown (iz API-ja) |
| Sidebar feed | ✅ Demo | Lista izveštaja sortirana po broju glasova, klik selektuje marker |
| Legenda | ✅ Demo | Police/Radar/Kontrola u donjem levom uglu mape |
| Filter po tipu | ❌ Ne postoji | Nema UI za filtriranje markera po tipu |
| Filter po vremenu | ❌ Ne postoji | Nema UI za filtriranje po starosti |
| Confidence badge | ❌ Ne postoji | Nema prikaz pouzdanosti |
| API integracija | ❌ Ne postoji | Svi podaci su lokalni JSON, nema fetch ka backendu |
| Dedicated /mapa ruta | ❌ Ne postoji | Mapa je samo sekcija na landing-u |
| Admin panel | ❌ Ne postoji | Nema nikakvih admin stranica |
| Admin auth | ❌ Ne postoji | Nema login sistem |

### Šta API (radar-puls-api) već ima

| Funkcionalnost | Status | Detalji |
|---|---|---|
| `GET /api/events/map` | ✅ Radi | Vraća enriched events sa filterima (since, eventType, geoOnly) |
| MapEventDto | ✅ Parcijalno | id, eventType, locationText, senderName, eventTime, lat, lng, geoSource, rawMessage — **nedostaje**: confidence, createdAt, description |
| Processing pipeline | ✅ Radi | raw → parsed → enriched (OpenAI) → geocoded |
| Device auth | ✅ Radi | Bearer token autentifikacija za device-ove |
| Admin endpoints | ❌ Ne postoji | Nema CRUD za admin |
| Admin auth | ❌ Ne postoji | Nema admin autentifikaciju |
| Public map endpoint | ❌ Parcijalno | `GET /api/events/map` zahteva device auth — treba public verzija |
| Approve/Reject flow | ❌ Ne postoji | `parsed_events` nema polje za moderaciju |
| Statistike | ❌ Ne postoji | Nema endpoint za dashboard stats |

---

## Plan implementacije

### Deo A — API: Public Map Endpoint i MapEventDto proširenje

**Cilj:** Omogućiti web frontendu da prikazuje live podatke bez device auth.

#### A1. Proširiti MapEventDto

Dodati polja koja nedostaju web klijentu:

```
MapEventDto {
  ...postojeća polja...
  + confidence: number | null     // iz parsed_events.confidence
  + createdAt: string             // ISO timestamp — za "pre X min" prikaz
  + description: string | null    // iz parsed_events.description
}
```

**Fajlovi:** `src/events/dto/map-event.dto.ts`, `src/events/events.service.ts`

#### A2. Public Map Endpoint (bez auth)

Novi endpoint koji ne zahteva device auth:

```
GET /api/map/reports
  Query: since, eventType, geoOnly (isti kao postojeći)
  Response: MapEventDto[]
  Auth: NONE (public)
  Rate limit: da (po IP)
```

Opcije:
- **Opcija 1:** Novi controller `MapController` sa javnim endpointom
- **Opcija 2:** Skinuti auth guard sa postojećeg `GET /api/events/map`
- **Opcija 3:** Oba — public readonly i auth-protected sa više podataka

**Preporuka:** Opcija 3 — public endpoint vraća samo bezbedne podatke (bez rawMessage), auth endpoint vraća sve.

**Fajlovi:** novi `src/map/map.controller.ts`, `src/map/map.module.ts`

#### A3. CORS konfiguracija

Dozvoliti web domenu pristup API-ju:

```
CORS_ORIGIN=https://radarpuls.com,http://localhost:3000
```

**Fajlovi:** `src/main.ts`, `src/config/env.validation.ts`

---

### Deo B — API: Admin Moderation sistem

**Cilj:** Omogućiti admin korisniku da pregleda, koriguje i moderira izveštaje.

#### B1. Moderation polja na parsed_events

Nova migracija — dodati:

```sql
ALTER TABLE parsed_events
  ADD COLUMN moderation_status TEXT DEFAULT 'auto_approved',
  ADD COLUMN moderated_by TEXT,
  ADD COLUMN moderated_at TIMESTAMPTZ,
  ADD COLUMN moderation_note TEXT;
```

Vrednosti za `moderation_status`: `auto_approved`, `pending_review`, `approved`, `rejected`

**Fajlovi:** nova migracija, `src/database/parsed-event.entity.ts`

#### B2. Admin autentifikacija

Opcije:
- **Opcija 1: Jednostavan static token** — `ADMIN_API_TOKEN` u env, bearer auth, admin guard
- **Opcija 2: Username/password sa JWT** — login endpoint, JWT token, refresh
- **Opcija 3: OAuth (Google/GitHub)** — third-party provider

**Preporuka za MVP:** Opcija 1 (static token) — najbrža implementacija, dovoljno za jednog admin korisnika. Opcija 2 kada bude više admina.

**Fajlovi:** `src/auth/admin-auth.guard.ts`, `src/config/env.validation.ts`

#### B3. Admin CRUD endpoints

```
GET    /api/admin/events           — Lista svih eventa sa paginacijom i filterima
GET    /api/admin/events/:id       — Detalj jednog eventa (raw + parsed + enrichment info)
PATCH  /api/admin/events/:id       — Ručna korekcija parsed polja
POST   /api/admin/events/:id/approve  — Odobri event
POST   /api/admin/events/:id/reject   — Odbij event sa napomenom
```

Filteri za listu:
- `status` (moderation_status)
- `eventType`
- `parseStatus` (parsed, no_match, partial)
- `enrichStatus` (pending, enriched, failed)
- `since` / `until`
- `page` / `limit`
- `search` (full text po rawMessage)

**Fajlovi:** novi `src/admin/admin.controller.ts`, `src/admin/admin.service.ts`, `src/admin/admin.module.ts`, `src/admin/dto/`

#### B4. Admin statistike endpoint

```
GET /api/admin/stats

Response:
{
  total_raw_events: number,
  total_parsed: number,
  total_enriched: number,
  total_failed: number,
  pending_review: number,
  approved: number,
  rejected: number,
  events_last_24h: number,
  events_last_7d: number,
  top_event_types: { type: string, count: number }[],
  enrichment_success_rate: number
}
```

**Fajlovi:** `src/admin/admin.service.ts`, `src/admin/dto/admin-stats.dto.ts`

#### B5. Re-enrich endpoint za admin

```
POST /api/admin/events/:id/re-enrich   — Ponovo pokreni AI enrichment za event
POST /api/admin/events/re-enrich-batch  — Re-enrich batch po filterima
```

**Fajlovi:** `src/admin/admin.service.ts`

---

### Deo C — Web: Live Mapa (zamena statičkih podataka)

**Cilj:** `MapClient` čita iz API-ja umesto iz `data/markers.json`.

#### C1. API servis za web

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export async function fetchMapReports(params?: {
  since?: string;
  eventType?: string;
  geoOnly?: boolean;
}): Promise<MapReport[]> { ... }
```

**Fajlovi:** novi `lib/api.ts`, `.env.local` primer

#### C2. Refaktor map-client.tsx — live podaci

- Zameniti `import markersData from "@/data/markers.json"` sa fetch iz API-ja
- Dodati `useEffect` polling (npr. svakih 30s)
- Dodati loading i error state
- Dodati "poslednje ažuriranje: pre X sekundi" indikator

**Fajlovi:** `components/landing/map-client.tsx`

#### C3. Filter UI komponente

- **Filter po tipu:** Toggle dugmad za police/radar/checkpoint/accident/traffic_jam
- **Filter po vremenu:** Dropdown ili dugmad: 1h / 6h / 12h / 24h
- Filteri šalju query parametre ka API-ju

**Fajlovi:** novi `components/map/type-filter.tsx`, `components/map/time-filter.tsx`

#### C4. Confidence badge

- Prikaži pouzdanost uz svaki marker popup i sidebar stavku
- Boje: zelena (>80), žuta (50-80), crvena (<50)

**Fajlovi:** `components/landing/map-client.tsx`

#### C5. Proširiti marker tipove

Dodati u web marker konfiguraciju:

```typescript
const markerConfig = {
  police:      { bg: "#DC2626", border: "#FCA5A5", emoji: "👮" },
  radar:       { bg: "#D97706", border: "#FCD34D", emoji: "📡" },
  checkpoint:  { bg: "#2563EB", border: "#93C5FD", emoji: "🚧" },
  accident:    { bg: "#7C3AED", border: "#C4B5FD", emoji: "💥" },  // NOVO
  traffic_jam: { bg: "#059669", border: "#6EE7B7", emoji: "🚗" },  // NOVO
  unknown:     { bg: "#6B7280", border: "#D1D5DB", emoji: "❓" },  // NOVO
};
```

**Fajlovi:** `components/landing/map-client.tsx`

#### C6. Dedicated /mapa full-page ruta

Nova stranica `app/[locale]/mapa/page.tsx`:
- Fullscreen mapa (ne sekcija u landing-u)
- Sidebar sa svim filterima
- Responsive layout
- SEO metadata

**Fajlovi:** novi `app/[locale]/mapa/page.tsx`, `components/map/full-map.tsx`

---

### Deo D — Web: Admin Panel

**Cilj:** Interni dashboard za moderaciju izveštaja.

#### D1. Admin Layout

- `/admin` ruta sa sidebar navigacijom
- Dark tema, kompaktan dizajn
- Protected — redirect na login ako nema token

**Fajlovi:**
- `app/[locale]/admin/layout.tsx`
- `components/admin/admin-sidebar.tsx`
- `components/admin/admin-header.tsx`

#### D2. Admin Login

- Jednostavan login form (token-based za MVP)
- Token se čuva u localStorage/cookie
- Redirect na dashboard nakon uspešnog login-a

**Fajlovi:**
- `app/[locale]/admin/login/page.tsx`
- `lib/admin-auth.ts`

#### D3. Dashboard stranica

- Stats kartice: ukupno eventa, pending review, approved, rejected, enrichment success rate
- Chart: events po danu (poslednih 7 dana)
- Chart: distribucija po tipu eventa
- Lista poslednjih 10 eventa

**Fajlovi:**
- `app/[locale]/admin/page.tsx`
- `components/admin/stats-cards.tsx`
- `components/admin/recent-events-table.tsx`

#### D4. Events lista stranica

- Tabela sa svim eventima
- Kolone: ID, Tip, Lokacija, Status, Vreme, Moderacija
- Filteri: tip, status, datum, search
- Paginacija
- Klik otvara detalj

**Fajlovi:**
- `app/[locale]/admin/events/page.tsx`
- `components/admin/events-table.tsx`
- `components/admin/event-filters.tsx`

#### D5. Event detalj stranica

- Prikaz raw poruke (originalni tekst)
- Prikaz parsed podataka (strukturirani podaci)
- Side-by-side komparacija raw vs parsed
- Mini mapa sa lokacijom markera
- Forma za ručnu korekciju (edit eventType, locationText, senderName, description)
- Approve/Reject dugmad sa napomenom
- Re-enrich dugme

**Fajlovi:**
- `app/[locale]/admin/events/[id]/page.tsx`
- `components/admin/event-detail.tsx`
- `components/admin/event-edit-form.tsx`
- `components/admin/raw-vs-parsed.tsx`

#### D6. Moderation workflow

- Events sa `moderation_status: pending_review` su istaknuti
- Bulk actions: approve/reject multiple
- Napomena uz svaki reject
- History: ko je i kada moderirao

---

## Redosled implementacije (preporuka)

```
Faza 1 — API osnova (backend)
  A1. Proširiti MapEventDto (confidence, createdAt, description)
  A2. Public map endpoint (bez auth)
  A3. CORS konfiguracija
  B1. Moderation polja migracija
  B2. Admin auth guard (static token)

Faza 2 — API admin (backend)
  B3. Admin CRUD endpoints
  B4. Admin statistike endpoint
  B5. Re-enrich endpoint

Faza 3 — Web live mapa (frontend)
  C1. API servis (lib/api.ts)
  C2. Refaktor map-client.tsx za live podatke
  C3. Filter UI komponente
  C4. Confidence badge
  C5. Proširiti marker tipove
  C6. Dedicated /mapa ruta

Faza 4 — Web admin panel (frontend)
  D1. Admin layout
  D2. Admin login
  D3. Dashboard stranica
  D4. Events lista
  D5. Event detalj + korekcija
  D6. Moderation workflow
```

---

## Opcioni predlozi (biraj šta ti se sviđa)

### Opcija E1 — WebSocket real-time updates

Umesto polling-a svakih 30s, koristiti WebSocket za instant update mape.

**API strana:**
- NestJS WebSocket Gateway (`@WebSocketGateway`)
- Emituje novi event kada se enrichment završi
- Event: `new_report`, `report_updated`, `report_removed`

**Web strana:**
- `useWebSocket` hook
- Mapa se ažurira u realnom vremenu bez refresha
- Animacija za nove markere (pulse efekat)

**Pro:** Pravi "live" osećaj, bitno za vozače  
**Con:** Kompleksnije, zahteva infrastrukturu za WS

---

### Opcija E2 — Glasanje (upvote/downvote) na izveštaje

Korisnici mogu potvrditi ili opovrgnuti izveštaj.

**API strana:**
```
POST /api/map/reports/:id/vote   { vote: "up" | "down" }
```
- Novo polje: `upvotes`, `downvotes` na `parsed_events`
- Rate limit: 1 glas po IP po izveštaju
- Threshold: ako je downvote > upvote × 2, sakrij izveštaj

**Web strana:**
- Thumbs up/down dugmad na svakom markeru popup
- Prikaz broja glasova

**Pro:** Community verifikacija, smanjuje lažne prijave  
**Con:** Zahteva IP tracking ili neku identifikaciju korisnika

---

### Opcija E3 — Heatmapa mod

Alternativni prikaz mape kao heatmap umesto individualnih markera.

**Web strana:**
- Toggle dugme: Markeri / Heatmapa
- Leaflet heatmap plugin (`leaflet.heat`)
- Grupiše izveštaje po gustini

**Pro:** Brzo vizuelno prepoznavanje "hot zones"  
**Con:** Gubi individualne detalje

---

### Opcija E4 — Public event submission (Web Report Form)

Omogućiti korisnicima da prijave izveštaj direktno sa web sajta.

**API strana:**
```
POST /api/map/reports
{
  eventType: "police" | "radar" | ...,
  locationText: string,
  lat?: number,
  lng?: number,
  description?: string
}
```
- reCAPTCHA validacija
- Rate limit: max 5 izveštaja po IP na sat

**Web strana:**
- "Prijavi" dugme na mapi
- Klik na mapu postavlja lat/lng
- Forma sa tipom i opisom
- Ova prijava ide na `moderation_status: pending_review`

**Pro:** Nezavisnost od Viber grupe, direktan user engagement  
**Con:** Potencijal za spam, zahteva moderaciju

---

### Opcija E5 — Event expiry i auto-cleanup

Izveštaji automatski ističu nakon određenog vremena.

**API strana:**
- Novo polje: `expires_at` na `parsed_events` (default: createdAt + 2h)
- Cron job: markira expired events
- Map endpoint ne vraća expired events
- Admin može produžiti rok

**Web strana:**
- Countdown na svakom markeru ("ističe za X min")
- Blede boje za events blizu isteka

**Pro:** Mapa uvek prikazuje relevantne podatke  
**Con:** Treba definisati politiku isteka po tipu

---

### Opcija E6 — Event clustering (grupiranje markera)

Kada je puno markera na mapi, grupišu se u klastere.

**Web strana:**
- `react-leaflet-cluster` plugin
- Na zoom out: grupiše bliske markere sa brojem
- Na zoom in: prikazuje individualne markere
- Klaster boja = dominantan tip u grupi

**Pro:** Čistija mapa pri velikom broju izveštaja  
**Con:** Mali overhead, ali značajno poboljšanje UX-a

---

### Opcija E7 — Notifikacije (Push/Email)

Obavesti korisnika kada se pojavi novi izveštaj u njegovoj zoni.

**API strana:**
- Subscription endpoint za zone (lat/lng/radius)
- Web Push API integracija
- Slanje notifikacija kada novi enriched event padne u zonu

**Web strana:**
- "Obavesti me za ovu zonu" dugme na mapi
- Browser push permission request
- Notification preferences stranica

**Pro:** Proaktivno obaveštavanje — ključna vrednost za vozače  
**Con:** Najkompleksnija stavka, zahteva push infrastrukturu

---

### Opcija E8 — Statistička stranica (javna)

Public stranica sa statistikama za Niš.

**API strana:**
```
GET /api/stats/public
{
  total_reports_today: number,
  total_reports_week: number,
  busiest_area: string,
  most_common_type: string,
  peak_hour: string,
  reports_by_type: { type: string, count: number }[],
  reports_by_hour: { hour: number, count: number }[]
}
```

**Web strana:**
- `/statistika` ruta
- Grafici i kartice
- SEO vrednost ("statistika radara Niš")

**Pro:** SEO, social proof, korisna info  
**Con:** Zahteva dovoljno podataka da statistika ima smisla

---

### Opcija E9 — Dark/Light mode za mapu

Mapa tiles se menjaju prema temi sajta.

**Web strana:**
- Light: CartoDB Voyager (trenutno)
- Dark: CartoDB Dark Matter
- Automatska promena sa sajt temom
- Marker boje prilagođene za dark mode

**Pro:** Konzistentan UX, vozači preferiraju dark noću  
**Con:** Minimal effort, ali lep detalj

---

### Opcija E10 — Geolokacija korisnika

"Moja lokacija" dugme na mapi.

**Web strana:**
- Browser Geolocation API
- Plavi marker za korisnikovu poziciju
- "Centraj na moju lokaciju" dugme
- Radius krug oko korisnika

**Pro:** Vozači odmah vide šta je oko njih  
**Con:** Zahteva GPS permission, ne radi svuda

---

## Tabela opcija za brzi izbor

| # | Opcija | Složenost | Vrednost | Preporuka |
|---|--------|-----------|----------|-----------|
| E1 | WebSocket real-time | Srednja | Visoka | ⭐ Da, u fazi 2 |
| E2 | Glasanje (upvote/downvote) | Srednja | Visoka | ⭐ Da, u admin + mapa |
| E3 | Heatmapa mod | Mala | Srednja | Opciono |
| E4 | Web report form | Srednja | Visoka | ⭐ Da, sa moderacijom |
| E5 | Event expiry | Mala | Visoka | ⭐ Da, obavezno |
| E6 | Event clustering | Mala | Srednja | ⭐ Da, lako |
| E7 | Push notifikacije | Velika | Visoka | Kasnije (faza 3+) |
| E8 | Public statistika | Mala | Srednja | ⭐ Lako, dobar SEO |
| E9 | Dark mode mapa | Mala | Mala | ⭐ Lako, lep detalj |
| E10 | Geolokacija korisnika | Mala | Visoka | ⭐ Da, obavezno |

---

## API ↔ Web usklađivanje — Rezime

Ono što API ima a web ne koristi:

| API mogućnost | Web status | Akcija |
|---|---|---|
| `GET /api/events/map` sa filterima | Ne koristi se | C1+C2: Povezati web sa API-jem |
| eventType: accident, traffic_jam, unknown | Ne postoje u web-u | C5: Dodati markere |
| since parametar | Nema UI | C3: Time filter |
| eventType parametar | Nema UI | C3: Type filter |
| geoOnly parametar | Nema UI | Automatski koristiti |
| enrichment pipeline | Nevidljiv korisniku | C4: Confidence badge |
| rawMessage u odgovoru | Nevidljiv | D5: Admin raw vs parsed |

Ono što web ima a API ne podržava:

| Web potreba | API status | Akcija |
|---|---|---|
| votes/potvrde | Nema | E2: Dodati voting |
| public pristup mapi | Zahteva device auth | A2: Public endpoint |
| moderation flow | Nema | B1+B3: Admin endpoints |
| statistike | Nema | B4+E8: Stats endpoints |
| event isteg | Nema | E5: Expiry system |
