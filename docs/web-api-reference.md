# Radar Puls Web — API Reference

**Base URL**: `https://api.radarpuls.com`  
**Datum**: 2026-03-15  
**Verzija API-ja**: v1 (production)

---

## Pregled endpointa

| Metoda | Putanja | Autorizacija | Opis |
|--------|---------|--------------|------|
| `GET` | `/health` | — | Health check |
| `GET` | `/api/map/reports` | — | Lista aktivnih dojava (javna mapa) |
| `POST` | `/api/map/reports` | reCAPTCHA | Pošalji novu dojavu sa weba |
| `POST` | `/api/map/reports/:id/vote` | — | Glasaj za/protiv dojave |
| `POST` | `/api/map/subscriptions` | — | Push notification pretplata |
| `DELETE` | `/api/map/subscriptions` | — | Odjava push notifikacija |
| `GET` | `/api/stats/public` | — | Javna statistika |
| WebSocket | `/socket.io` | — | Real-time dojave (Socket.IO) |

> Endpointi pod `/api/events/*` su za Android/device klijente — **ne koristiti u webu**.

---

## 1. Health check

```
GET /health
```

**Response 200:**
```json
{
  "status": "ok",
  "db": "up"
}
```

---

## 2. Lista dojava — javna mapa

```
GET /api/map/reports
```

**Nema autorizacije.** Rate limit: IP-based (max ~60 req/min).

### Query parametri (svi opcioni)

| Parametar | Tip | Default | Opis |
|-----------|-----|---------|------|
| `since` | `ISO8601` string | poslednjih 6h | Prikaži dojave novije od ovog datuma |
| `eventType` | string | sve | Filtriraj po tipu: `police`, `accident`, `traffic_jam`, `radar`, `control`, `unknown`. Može biti comma-separated lista. |
| `geoOnly` | `"true"` / `"false"` | `"true"` | Ako `true`, vraća samo dojave koje imaju koordinate (lat/lng) |

### Primeri

```
GET /api/map/reports
GET /api/map/reports?since=2026-03-15T12:00:00Z
GET /api/map/reports?eventType=police,accident&geoOnly=true
GET /api/map/reports?geoOnly=false
```

### Response 200 — niz `MapEventDto`

```json
[
  {
    "id": "uuid-ovde",
    "eventType": "accident",
    "locationText": "Vojvode Putnika bb",
    "senderName": "Marko P.",
    "description": "Sudar dva vozila, usporenje saobraćaja",
    "confidence": 0.91,
    "eventTime": "2026-03-15T17:45:00.000Z",
    "createdAt": "2026-03-15T18:00:01.000Z",
    "expiresAt": "2026-03-16T00:00:01.000Z",
    "lat": 43.8563,
    "lng": 20.3919,
    "geoSource": "nominatim",
    "upvotes": 3,
    "downvotes": 0
  }
]
```

### Tipovi vrednosti

| Polje | Tip | Napomena |
|-------|-----|---------|
| `id` | `string (UUID)` | Koristiti za glasanje i real-time matching |
| `eventType` | `"police" \| "accident" \| "traffic_jam" \| "radar" \| "control" \| "unknown"` | |
| `locationText` | `string \| null` | |
| `senderName` | `string \| null` | |
| `description` | `string \| null` | |
| `confidence` | `number` (0–1) | AI confidence skor |
| `eventTime` | `ISO8601 \| null` | Kada se za desio događaj |
| `createdAt` | `ISO8601` | Kada je primljeno |
| `expiresAt` | `ISO8601` | Kada nestaje sa mape (tipično +6h) |
| `lat` | `number \| null` | |
| `lng` | `number \| null` | |
| `geoSource` | `"nominatim" \| "fallback" \| null` | Kako su koordinate nađene |
| `upvotes` | `number` | |
| `downvotes` | `number` | |
| `rawMessage` | `string` (opciono) | Vraća se samo za autorizovane device klijente — **neće biti u web responsu** |

> **Napomena za mapu**: Ako `lat`/`lng` su `null` i `geoOnly=true` (default), takve dojave neće biti u listi. Ako hoćeš prikazivati i bez koordinata (npr. sidebar lista), postavi `geoOnly=false`.

---

## 3. Pošalji novu dojavu (web forma)

```
POST /api/map/reports
Content-Type: application/json
```

### Request body

```json
{
  "eventType": "accident",
  "locationText": "Vojvode Putnika, Čačak",
  "senderName": "Marko",
  "description": "Sudar na raskrsnici, usporen saobraćaj",
  "lat": 43.8563,
  "lng": 20.3919,
  "recaptchaToken": "token-od-google-recaptcha"
}
```

| Polje | Tip | Obavezno | Ograničenja |
|-------|-----|----------|-------------|
| `eventType` | string | **Da** | Jedna od: `police`, `accident`, `traffic_jam`, `radar`, `control`, `unknown` |
| `locationText` | string | **Da** | Max 250 karaktera |
| `senderName` | string | Ne | Max 120 karaktera |
| `description` | string | Ne | Max 500 karaktera |
| `lat` | number | Ne | Validna geografska širina |
| `lng` | number | Ne | Validna geografska dužina |
| `recaptchaToken` | string | Ne (preporučeno) | Google reCAPTCHA v2/v3 token |

### Response 200

```json
{
  "id": "uuid-nove-dojave",
  "moderationStatus": "pending_review"
}
```

> **Napomena**: Nova dojava neće odmah biti vidljiva na mapi — status je `pending_review` dok admin ne odobri. Posle odobravanja, pojaviće se u `/api/map/reports` i u WebSocket eventu `new_report`.

### Greške

| HTTP | Razlog |
|------|--------|
| `400` | Pogrešni podaci (nevalidan `eventType`, predugačak tekst, itd.) |
| `422` | reCAPTCHA check nije prošao |
| `429` | Rate limit prekoračen (previše zahteva sa iste IP) |

---

## 4. Glasanje za dojavu

```
POST /api/map/reports/:id/vote
Content-Type: application/json
```

| Parametar | Opis |
|-----------|------|
| `:id` | UUID dojave iz `/api/map/reports` liste |

### Request body

```json
{
  "vote": "up"
}
```

`vote` može biti `"up"` ili `"down"`.

### Response 200

```json
{
  "id": "uuid-dojave",
  "upvotes": 4,
  "downvotes": 1
}
```

### Greške

| HTTP | Razlog |
|------|--------|
| `404` | Dojava ne postoji ili je istekla |
| `429` | Isti korisnik (IP) već glasao za tu dojavu |

> **Automatsko uklanjanje**: Ako `downvotes > upvotes * 2`, dojava se automatski uklanja sa mape i šalje se `report_removed` WebSocket event.

---

## 5. Push notification pretplata

```
POST /api/map/subscriptions
Content-Type: application/json
```

### Request body

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "keybytes...",
    "auth": "authbytes..."
  },
  "zoneLat": 43.8563,
  "zoneLng": 20.3919,
  "radiusMeters": 5000
}
```

| Polje | Obavezno | Opis |
|-------|----------|------|
| `endpoint` | **Da** | Web Push endpoint URL (iz `PushSubscription` browser API-ja) |
| `keys.p256dh` | **Da** | Encryption key |
| `keys.auth` | **Da** | Auth secret |
| `zoneLat` / `zoneLng` | Ne | Koordinate zone za koju primati notifikacije |
| `radiusMeters` | Ne | Radius zone u metrima (300–100000, default: globalno) |

### Response 200

```json
{ "status": "subscribed" }
```

---

## 6. Odjava push notifikacija

```
DELETE /api/map/subscriptions
Content-Type: application/json
```

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

### Response 200

```json
{ "status": "unsubscribed" }
```

---

## 7. Javna statistika

```
GET /api/stats/public
```

**Nema autorizacije.**

### Response 200

```json
{
  "total_reports_today": 12,
  "total_reports_week": 87,
  "busiest_area": "Vojvode Putnika",
  "most_common_type": "radar",
  "peak_hour": "17:00",
  "reports_by_type": [
    { "type": "radar", "count": 34 },
    { "type": "police", "count": 22 },
    { "type": "accident", "count": 18 },
    { "type": "traffic_jam", "count": 9 },
    { "type": "control", "count": 4 }
  ],
  "reports_by_hour": [
    { "hour": 7, "count": 5 },
    { "hour": 8, "count": 11 },
    { "hour": 17, "count": 19 }
  ]
}
```

> Statistika uključuje samo odobrene, aktivne dojave (nije isteklo `expires_at`, nije preglasano).

---

## 8. WebSocket — real-time dojave

```
wss://api.radarpuls.com/socket.io
```

Koristi **Socket.IO** klijent (v4+).

### Konekcija (JavaScript primer)

```javascript
import { io } from "socket.io-client";

const socket = io("https://api.radarpuls.com", {
  path: "/socket.io",
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("Połączone sa real-time stream-om");
});

// Potvrda konekcije od servera
socket.on("connected", (data) => {
  // data: { status: "ok", channel: "map-live" }
});

// Admin stream (zahteva admin token)
const adminSocket = io("https://api.radarpuls.com", {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  auth: { token: "<ADMIN_API_TOKEN>" },
});

adminSocket.on("event", (data) => {
  // data: { type: "new_report" | "report_updated" | "report_removed", reportId: "uuid", payload?: unknown }
});
```

> **Važno**: koristi se Socket.IO putanja `/socket.io`.

### Događaji koje server šalje

| Event | Kada se emituje | Payload |
|-------|----------------|---------|
| `connected` | Odmah po konekciji | `{ status: "ok", channel: "map-live" }` |
| `new_report` | Nova dojava je odobrena i vidljiva | `{ id: "uuid" }` (ili pun `MapEventDto` objekat) |
| `report_updated` | Dojava je glasana (broj upvotes/downvotes se promenio) | `{ id: "uuid", upvotes: N, downvotes: N }` |
| `report_removed` | Dojava je preglasana i skinuta sa mape | `{ id: "uuid" }` |
| `event` | Admin auth stream (token u `auth.token`) | `{ type, reportId, payload? }` |

### Preporučena web integracija

```javascript
// Osveži listu kada stigne nova dojava
socket.on("new_report", async () => {
  const reports = await fetchReports(); // pozovi GET /api/map/reports
  updateMapMarkers(reports);
});

// Ažuriraj glasove bez ponovnog fetcha
socket.on("report_updated", ({ id, upvotes, downvotes }) => {
  updateReportVotes(id, upvotes, downvotes);
});

// Ukloni marker sa mape
socket.on("report_removed", ({ id }) => {
  removeMapMarker(id);
});
```

---

## Tipovi događaja (eventType)

| Vrednost | Srpski naziv | Ikona (predlog) |
|----------|-------------|-----------------|
| `police` | Policija | 🚔 |
| `accident` | Saobraćajna nezgoda | 🚗💥 |
| `traffic_jam` | Gužva | 🚦 |
| `radar` | Radar | 📷 |
| `control` | Kontrola (PU, carina, itd.) | 🛂 |
| `unknown` | Nepoznato | ❓ |

---

## CORS

API prihvata zahteve sa domena koji je konfigurisan u `CORS_ORIGIN` env varijabli na serveru.  
Za lokalni development, kontaktirati admina da doda `http://localhost:5173` (ili port koji koristiš).

---

## Rate limiting (javni endpointi)

| Endpoint | Limit |
|----------|-------|
| `GET /api/map/reports` | ~60 req/min po IP |
| `POST /api/map/reports` | ~5 req/min po IP |
| `POST /api/map/reports/:id/vote` | 1 glas po IP po dojavi |
| `POST /api/map/subscriptions` | ~10 req/min po IP |

Prekoračenje vraća `HTTP 429 Too Many Requests`.

---

## Primer — kompletan flow za web mapu

```javascript
// 1. Inicijalno učitavanje mape
const reports = await fetch("https://api.radarpuls.com/api/map/reports?geoOnly=true")
  .then(r => r.json());

// 2. Prikaz markera
reports.forEach(report => addMarker(report));

// 3. Real-time ažuriranje
const socket = io("https://api.radarpuls.com", { path: "/ws/map" });
socket.on("new_report", async () => {
  const fresh = await fetch("https://api.radarpuls.com/api/map/reports?geoOnly=true").then(r => r.json());
  refreshMarkers(fresh);
});
socket.on("report_updated", ({ id, upvotes, downvotes }) => updateVotes(id, upvotes, downvotes));
socket.on("report_removed", ({ id }) => removeMarker(id));

// 4. Glasanje
async function vote(reportId, direction) {
  const res = await fetch(`https://api.radarpuls.com/api/map/reports/${reportId}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vote: direction }), // "up" ili "down"
  });
  if (res.status === 429) alert("Već si glasao za ovu dojavu.");
  return res.json(); // { id, upvotes, downvotes }
}

// 5. Slanje dojave
async function submitReport(formData) {
  const res = await fetch("https://api.radarpuls.com/api/map/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: formData.type,
      locationText: formData.location,
      description: formData.description,
      lat: formData.lat,
      lng: formData.lng,
      recaptchaToken: formData.captchaToken,
    }),
  });
  return res.json(); // { id, moderationStatus: "pending_review" }
}
```
