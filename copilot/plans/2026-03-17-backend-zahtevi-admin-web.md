# Backend zahtevi — Admin web client

**Datum:** 2026-03-17  
**Prioritet:** Visok  
**Kontekst:** Dijagnostifikovane greške u web admin klientu koje zahtevaju backend implementaciju ili ispravke.

---

## Pregled

| # | Problem | Kategorija | Prioritet |
|---|---------|------------|-----------|
| 1 | `GET /api/admin/geocoding-cache` vraća `400` za standardne query parametre | Bugfix | Visok |
| 2 | Socket.IO endpoint nedostaje — admin realtime ne radi | Featura | Srednji |
| 3 | `POST /api/admin/events/bulk-confirm-location` — endpoint nedokumentovan | Dokumentacija/Verifikacija | Srednji |
| 4 | `GET /api/admin/events/confirm-location-candidates` — endpoint nedokumentovan | Dokumentacija/Verifikacija | Srednji |
| 5 | `GET /api/admin/events/:id/activity-log` — endpoint nedokumentovan | Dokumentacija/Verifikacija | Nizak |

---

## 1. `GET /api/admin/geocoding-cache` — vraća 400

### Simptom

```
GET http://localhost:3001/api/proxy/admin/geocoding-cache?sortBy=hitCount&sortOrder=desc&page=1&limit=100
→ 400 Bad Request
```

### Uzrok

Backend odbija `sortBy` i/ili `sortOrder` parametre jer ih ne prepoznaje ili ne podržava.

### Šta web klijent šalje (sad popravljeno — više ne šalje sortBy/sortOrder)

| Param | Tip | Opis |
|-------|-----|------|
| `search` | string (opciono) | Full-text pretraga po location tekstu |
| `verified` | `"true"` / `"false"` (opciono) | Filter po verified statusu |
| `page` | number | Stranica, default `1` |
| `limit` | number | Broj rezultata, default `100` |

### Šta backend treba da vrati

```json
{
  "items": [
    {
      "id": "uuid",
      "locationText": "Bulevar Nemanjica",
      "lat": 43.321,
      "lng": 21.896,
      "hitCount": 15,
      "verified": true,
      "formattedAddress": "Bulevar Nemanjica, Niš",
      "createdAt": "2026-03-10T12:00:00Z",
      "updatedAt": "2026-03-15T08:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 100
}
```

### Zahtevane akcije

1. **Potvrditi** koji query parametri su validni i dokumentovati ih.
2. **Dodati podršku** za `sortBy` i `sortOrder` (opciono, ali poželjno):
   - `sortBy`: `hitCount` | `createdAt` | `updatedAt` | `locationText`
   - `sortOrder`: `asc` | `desc`
3. Ako se sorting ne implementuje, frontend sortira klijentski po `hitCount` — prihvatljivo za limitiran skup podataka.

---

## 2. Socket.IO endpoint — admin realtime

### Simptom

```
WebSocket connection to 'ws://localhost:3000/socket.io/?EIO=4&transport=websocket' failed
```

### Kako web klijent koristi realtime

Fajl: `lib/hooks/use-admin-realtime.ts`

```ts
const socket = io(API_BASE_URL, {
  transports: ["websocket", "polling"],
  auth: { token: adminToken },
});

socket.on("event", (data: { type: "new_report" | "report_updated" | "report_removed", reportId: string, payload?: unknown }) => {
  // ...
});
```

### Zahtevana backend implementacija

Backend treba da:

1. **Pokrene Socket.IO server** na istom HTTP serveru (ili posebnom portu sa CORS).
2. **Autentifikuje konekciju** preko `auth.token` (Bearer token iz admin sesije).
3. **Emituje `event`** poruke sledeceg oblika:

```json
{
  "type": "new_report",
  "reportId": "uuid",
  "payload": { /* opciono */ }
}
```

Podrzani tipovi: `new_report` | `report_updated` | `report_removed`

4. **Trigeri za emit:**
   - Nova prijava ingestionovana → `new_report`
   - Status ili polje promenjeno (approve/reject/patch) → `report_updated`
   - Prijava obrisana → `report_removed`

### CORS / transport napomena

Frontend salje konekciju na `NEXT_PUBLIC_API_URL` (u produkciji `https://api.radarpuls.com`).  
Backend treba da dozvoli origin web deploymentа u Socket.IO CORS konfiguraciji.

---

## 3. `POST /api/admin/events/bulk-confirm-location`

### Kako klijent poziva

```
POST /api/admin/events/bulk-confirm-location
Authorization: Bearer <token>
Content-Type: application/json

{
  "eventIds": ["uuid1", "uuid2", "uuid3"]
}
```

### Ocekivani response

```json
{
  "confirmed": 3,
  "cached": 2
}
```

> `confirmed` = broj eventa kojima je lokacija uspesno potvrdjena  
> `cached` = broj eventa koji su iskoristili vec kesirani rezultat

### Akcija

Verifikovati da endpoint postoji i radi. Dodati u `docs/api-endpoints.md`.

---

## 4. `GET /api/admin/events/confirm-location-candidates`

### Kako klijent koristi

```
GET /api/admin/events/confirm-location-candidates
Authorization: Bearer <token>
```

### Ocekivani response

```json
[
  {
    "location_text": "Bulevar Nemanjica",
    "lat": 43.321,
    "lng": 21.896,
    "geo_source": "google",
    "occurrence_count": 7,
    "event_ids": ["uuid1", "uuid2", "uuid3"]
  }
]
```

### Logika

Endpoint grupiše pending evente po `locationText` gde vec postoji geocoded koordinata, i vraca predloge za bulk potvrdu. Frontend ih prikazuje u "Kandidati" panelu.

### Akcija

Verifikovati da endpoint postoji i radi. Dodati u `docs/api-endpoints.md`.

---

## 5. `GET /api/admin/events/:id/activity-log`

### Kako klijent koristi

```
GET /api/admin/events/{uuid}/activity-log
Authorization: Bearer <token>
```

### Ocekivani response

```json
[
  {
    "id": "uuid",
    "event_id": "uuid",
    "action": "approved",
    "performed_by": "admin",
    "old_values": { "moderation_status": "pending_review" },
    "new_values": { "moderation_status": "approved" },
    "note": null,
    "created_at": "2026-03-17T10:00:00Z"
  }
]
```

### Akcija

Verifikovati da endpoint postoji i radi. Dodati u `docs/api-endpoints.md`.

---

## Prioritetni redosled implementacije

```
[P1] Bugfix geocoding-cache → odmah
[P2] Bulk operacije verifikacija → pre produkcijskog testiranja admina
[P3] Socket.IO realtime → requirements za v2 push
[P4] Activity log verifikacija → dokumentacija
```

---

## Potrebna dokumentacija u `docs/api-endpoints.md`

Sledeci endpointi nedostaju u dokumentaciji i treba ih dodati:

- `GET /api/admin/geocoding-cache`
- `PATCH /api/admin/geocoding-cache/:id`
- `DELETE /api/admin/geocoding-cache/:id`
- `POST /api/admin/events/:id/confirm-location`
- `POST /api/admin/events/bulk-confirm-location`
- `GET /api/admin/events/confirm-location-candidates`
- `GET /api/admin/events/:id/activity-log`
