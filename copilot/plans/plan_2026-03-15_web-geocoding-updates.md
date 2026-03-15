# Plan: Promene u radar-puls-web nakon migracije na Google Geocoding API

**Datum:** 2026-03-15  
**Status:** PLANIRAN  
**Prioritet:** Srednji  
**Zavisi od:** `plan_2026-03-15_google-geocoding-migration.md` (backend)

---

## 1. Pregled trenutnog stanja u radar-puls-web

Web projekat (`LakishaDev/radar-puls-web`) **ne poziva Nominatim direktno**. Sav geocoding se obavlja na backendu. Medjutim, web projekat koristi `geoSource` polje iz API odgovora na vise mesta:

### Fajlovi koji referenciraju geoSource:

| Fajl | Upotreba |
|------|----------|
| `lib/api.ts` | `MapReport` interface — `geoSource: string \| null` |
| `components/landing/map-client.tsx` | Koristi `geoSource` iz normalizovanog report-a (setuje "demo" za demo podatke) |
| `lib/admin-api.ts` | Indirektno — ne parsira geoSource, ali ga API vraca |

### Kljucni nalaz:
- `geoSource` je definisan kao `string | null` u web projektu — **nije hardkodiran na "fallback" | "nominatim"**
- Ovo znaci da backend promena nece slomiti web (backward compatible)
- Medjutim, trebamo dodati UI logiku za nove source tipove

---

## 2. Potrebne promene

### 2.1 Azuriranje `lib/api.ts` — GeoSource tip

**Trenutno:**
```typescript
geoSource: string | null;
```

**Predlog:**
```typescript
export type GeoSource = "fallback" | "cache" | "google" | "google_partial" | "nominatim" | "demo" | null;

// U MapReport interface:
geoSource: GeoSource;
```

Dodajemo eksplicitan tip umesto `string | null` za bolju type safety. Zadrzavamo `"nominatim"` za backward compatibility sa starim podacima u bazi.

---

### 2.2 Vizuelni indikator za partial match na mapi

Kada je `geoSource === "google_partial"`, lokacija nije 100% pouzdana. Trebamo to prikazati korisniku.

#### Opcija A: Badge u popup-u (preporuceno)

U `map-client.tsx`, unutar Marker Popup-a, dodati indikator:

```tsx
{report.geoSource === "google_partial" && (
  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
    <MapPin className="h-3 w-3" />
    {t("geo.approximate")}
  </span>
)}
```

#### Opcija B: Marker opacity (dodatno)

Za partial match lokacije, marker moze imati smanjenu opacnost:

```tsx
const opacity = report.geoSource === "google_partial" ? 0.7 : 1.0;
```

---

### 2.3 Azuriranje i18n prevodima

Dodati nove kljuceve u lokalizacione fajlove (`i18n/`):

```json
{
  "map": {
    "geo": {
      "approximate": "Približna lokacija",
      "verified": "Potvrđena lokacija",
      "source": {
        "fallback": "Poznata lokacija",
        "cache": "Potvrđena lokacija",
        "google": "Google Maps",
        "google_partial": "Približna lokacija",
        "nominatim": "OpenStreetMap"
      }
    }
  }
}
```

---

### 2.4 Admin panel — prikaz geo source-a

Trenutno `admin-event-detail-client.tsx` ne prikazuje `geoSource`. Mozemo ga dodati u parsed data sekciju:

```tsx
<div>
  <dt className="text-slate-500">{t("eventDetail.fields.geoSource")}</dt>
  <dd>{event?.geoSource ?? "--"}</dd>
</div>
```

Takodje dodati u `AdminEventDetail` interface:
```typescript
export interface AdminEventDetail extends AdminEventListItem {
  // ... existing fields
  geoSource: string | null;  // dodati
}
```

I u `normalizeDetail()` funkciju u `admin-api.ts`:
```typescript
geoSource: typeof raw.geoSource === "string" ? raw.geoSource 
         : typeof raw.geo_source === "string" ? String(raw.geo_source) 
         : null,
```

---

### 2.5 Potencijalno: Tooltip sa informacijom o preciznosti

Za report-e sa koordinatama, prikazati tooltip informaciju:

| geoSource | Prikaz | Ikonica |
|-----------|--------|---------|
| `fallback` | "Poznata tačka" | ✅ zelena |
| `cache` | "Potvrđena lokacija" | ✅ zelena |
| `google` | "Google Maps" | 📍 plava |
| `google_partial` | "Približna lokacija" | ⚠️ narandžasta |
| `nominatim` | "OpenStreetMap" | 📍 plava (legacy) |
| `null` | ne prikazuje se | — |

---

## 3. Koraci implementacije

### Faza 1: Tipovi i backward compatibility
- [ ] Dodati `GeoSource` tip u `lib/api.ts`
- [ ] Azurirati `MapReport` interface
- [ ] Azurirati `AdminEventDetail` interface u `lib/admin-api.ts`
- [ ] Azurirati `normalizeDetail()` da parsira `geoSource`/`geo_source`

### Faza 2: UI za partial match
- [ ] Dodati badge/indikator u map popup (map-client.tsx)
- [ ] Opciono: Dodati opacity razliku za partial match markere
- [ ] Dodati i18n prevode za geo source tipove

### Faza 3: Admin panel
- [ ] Prikazati `geoSource` u event detail stranici
- [ ] Dodati i18n kljuceve za admin panel

### Faza 4: Testiranje
- [ ] Proveriti da stari podaci sa `geoSource: "nominatim"` rade ispravno
- [ ] Proveriti prikaz za nove source tipove
- [ ] Proveriti da demo podaci i dalje rade (`geoSource: "demo"`)

---

## 4. Napomene

- **Ove promene su backward compatible** — web sajt ce raditi i pre i posle backend migracije
- Web projekat ne poziva Nominatim API direktno, pa nema breaking promena
- `geoSource` je vec `string | null`, pa nove vrednosti nece izazvati runtime gresku
- Promene su uglavnom kozmeticke/UX poboljsanja (prikaz partial match indikatora)
- Preporuka: deployovati backend promene prvo, pa onda web promene

---

## 5. Fajlovi za promenu (sumarno)

```
lib/api.ts                                    — GeoSource tip, MapReport
lib/admin-api.ts                              — AdminEventDetail, normalizeDetail()
components/landing/map-client.tsx             — partial match indikator u popup-u
components/admin/admin-event-detail-client.tsx — prikaz geoSource polja
i18n/messages/sr.json                         — novi prevodi
i18n/messages/en.json                         — novi prevodi
```
