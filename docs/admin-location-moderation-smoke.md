# Admin Location Moderation and Advanced Admin API - Smoke Test Runbook

## Priprema

```bash
cd /home/lazar/projekti/radar-puls/radar-puls-api
BASE=http://localhost:3000
ADMIN_TOKEN=$(grep -m1 '^ADMIN_API_TOKEN=' .env | cut -d'=' -f2-)
```

## 1) Health

```bash
curl -sS "$BASE/health"
```

Ocekivano:

```json
{"status":"ok","db":"up"}
```

## 2) Create test report (public)

With coordinates:

```bash
curl -sS -X POST "$BASE/api/map/reports" \
  -H 'Content-Type: application/json' \
  --data '{"eventType":"unknown","locationText":"Smoke Test Lokacija Nis","description":"smoke flow","lat":43.3203,"lng":21.8958}'
```

Save `id` from response to `EVENT_ID`.

## 3) PATCH admin event

```bash
curl -sS -X PATCH "$BASE/api/admin/events/$EVENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"description":"admin patch smoke","confidence":88}'
```

Expected:

```json
{"id":"...","edit_source":"admin_edited"}
```

## 4) Confirm location

```bash
curl -sS -X POST "$BASE/api/admin/events/$EVENT_ID/confirm-location" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"confirmedBy":"smoke-test-admin"}'
```

Expected:

```json
{"id":"...","cached":true}
```

## 5) Provera detalja eventa

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/events/$EVENT_ID"
```

Important fields:
- `geo_source` -> `admin_confirmed`
- `edit_source` -> `admin_confirmed`
- `moderation_status` -> `approved`

## 6) Check stats metrics

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/stats"
```

Important fields:
- `admin_edited_count`
- `admin_confirmed_count`
- `admin_geo_count`

## 7) Event activity log and recent activity log

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/events/$EVENT_ID/activity-log"
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/activity-log?limit=10"
```

## 8) Bulk confirm location

```bash
curl -sS -X POST "$BASE/api/admin/events/bulk-confirm-location" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "{\"eventIds\":[\"$EVENT_ID\"],\"confirmedBy\":\"smoke-admin\"}"
```

Expected shape:

```json
{"confirmed":1,"cached":1}
```

## 9) Confirm-location candidates

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/events/confirm-location-candidates"
```

## 10) Geocoding cache admin CRUD

List:

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/geocoding-cache?limit=5&page=1"
```

Get one entry (replace CACHE_ID):

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/geocoding-cache/CACHE_ID"
```

Patch one entry:

```bash
curl -sS -X PATCH "$BASE/api/admin/geocoding-cache/CACHE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"verified":true}'
```

Delete one entry:

```bash
curl -sS -X DELETE "$BASE/api/admin/geocoding-cache/CACHE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 11) Location aliases admin CRUD

Create:

```bash
ALIAS_CREATE=$(curl -sS -X POST "$BASE/api/admin/location-aliases" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"aliasText":"kod smoke test tacke","targetLocationText":"Smoke Test Lokacija Nis","targetLat":43.3203,"targetLng":21.8958,"createdBy":"smoke-admin"}')
ALIAS_ID=$(printf '%s' "$ALIAS_CREATE" | node -e 'const fs=require("fs");const o=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(o.id||"")')
```

List:

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/location-aliases?search=smoke&limit=10&page=1"
```

Delete:

```bash
curl -sS -X DELETE "$BASE/api/admin/location-aliases/$ALIAS_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 12) Reject and restore flow (soft delete)

Reject:

```bash
curl -sS -X POST "$BASE/api/admin/events/$EVENT_ID/reject" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"moderatedBy":"smoke-admin","note":"reject for restore test"}'
```

Restore:

```bash
curl -sS -X POST "$BASE/api/admin/events/$EVENT_ID/restore" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"moderatedBy":"smoke-admin","note":"restore smoke"}'
```

Final check:

```bash
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/events/$EVENT_ID"
```

Expected after restore:
- `moderation_status` is `pending_review`
- `hidden_at` is `null`

## Negativni testovi

### A) Admin bez tokena -> 401

```bash
curl -i -sS "$BASE/api/admin/events?limit=1&page=1"
```

### B) Admin sa pogresnim tokenom -> 401

```bash
curl -i -sS -H 'Authorization: Bearer wrong-token' "$BASE/api/admin/events?limit=1&page=1"
```

### C) PATCH bez polja -> 400

```bash
curl -i -sS -X PATCH "$BASE/api/admin/events/$EVENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

### D) PATCH invalid latitude -> 400

```bash
curl -i -sS -X PATCH "$BASE/api/admin/events/$EVENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"latitude":120}'
```

### E) confirm-location bez koordinata za no-geo event -> 400

Napraviti event bez `lat/lng` pa pozvati confirm-location bez override koordinata.

```bash
NO_GEO=$(curl -sS -X POST "$BASE/api/map/reports" \
  -H 'Content-Type: application/json' \
  --data '{"eventType":"unknown","locationText":"Smoke no geo location","description":"negative test"}')
NO_GEO_ID=$(printf '%s' "$NO_GEO" | node -e 'const fs=require("fs");const o=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(o.id||"")')

curl -i -sS -X POST "$BASE/api/admin/events/$NO_GEO_ID/confirm-location" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"confirmedBy":"smoke-test"}'
```

### F) confirm-location za nepostojeci id -> 404

```bash
curl -i -sS -X POST "$BASE/api/admin/events/00000000-0000-0000-0000-000000000000/confirm-location" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"latitude":43.3,"longitude":21.9,"locationText":"x"}'
```

### G) bulk-confirm-location sa invalid UUID -> 400

```bash
curl -i -sS -X POST "$BASE/api/admin/events/bulk-confirm-location" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"eventIds":["not-a-uuid"]}'
```

### H) geocoding-cache PATCH missing ID -> 404

```bash
curl -i -sS -X PATCH "$BASE/api/admin/geocoding-cache/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

### I) location-aliases duplicate create -> 409

```bash
curl -i -sS -X POST "$BASE/api/admin/location-aliases" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"aliasText":"smoke duplicate alias","targetLocationText":"Smoke Neg Nis","targetLat":43.31,"targetLng":21.90,"createdBy":"smoke-admin"}'
```

### J) location-aliases delete missing -> 404

```bash
curl -i -sS -X DELETE "$BASE/api/admin/location-aliases/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### K) restore non-rejected event -> 404

```bash
curl -i -sS -X POST "$BASE/api/admin/events/$EVENT_ID/restore" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"moderatedBy":"smoke-admin"}'
```

## Negativni testovi - izvrseni rezultati (2026-03-17)

| Test | Ocekivano | Dobijeno | Status |
|------|-----------|----------|--------|
| admin events no token | 401 | 401 | PASS |
| admin events wrong token | 401 | 401 | PASS |
| patch empty payload | 400 | 400 | PASS |
| patch invalid latitude | 400 | 400 | PASS |
| confirm no geo no override | 400 | 400 | PASS |
| confirm invalid id | 404 | 404 | PASS |
| bulk invalid uuid | 400 | 400 | PASS |
| geocoding-cache patch missing id | 404 | 404 | PASS |
| alias duplicate create | 409 | 409 | PASS |
| alias delete missing | 404 | 404 | PASS |
| restore non-rejected | 404 | 404 | PASS |
