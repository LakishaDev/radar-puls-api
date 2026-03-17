# API Endpoints Reference

Base URL: `http://localhost:3000`

---

## Health

### `GET /health`
No auth required.

**Response**
```json
{ "status": "ok", "db": "up" }
```

---

## Stats

### `GET /api/stats/public`
No auth required.

**Response**
```json
{
  "total_reports_today": 42,
  "total_reports_week": 300,
  "busiest_area": "Bulevar Nemanjica",
  "most_common_type": "radar",
  "peak_hour": 8,
  "reports_by_type": [{ "eventType": "radar", "count": 20 }],
  "reports_by_hour": [{ "hour": 8, "count": 15 }]
}
```

---

## Events
Auth: `Authorization: Bearer <device-token>`

### `POST /api/events/viber`
Ingest a Viber message as a raw event.

**Request**
```json
{
  "source": "viber",
  "group": "radar-test",
  "message": "Malča-prosek radar",
  "timestamp": "2026-03-13T10:00:00Z",
  "device_id": "android_listener_01"
}
```

**Response**
```json
{ "status": "accepted", "request_id": "uuid" }
```

> Send `x-radar-force-429: 1` header to force a rate-limit response (dev only).

---

### `GET /api/events/map`
Returns map events visible to the authenticated device.

**Query params**
| Param | Type | Description |
|-------|------|-------------|
| `since` | ISO8601 | Filter events after this time |
| `eventType` | string | Filter by type |
| `geoOnly` | boolean | Only events with coordinates |

**Response** — array of `MapEventDto`:
```json
[
  {
    "id": "uuid",
    "eventType": "radar",
    "locationText": "Malča-prosek",
    "senderName": "listener_01",
    "description": "radar na mostu",
    "confidence": 0.95,
    "eventTime": "2026-03-13T10:00:00Z",
    "createdAt": "2026-03-13T10:00:05Z",
    "expiresAt": "2026-03-13T12:00:05Z",
    "lat": 43.3,
    "lng": 21.9,
    "geoSource": "geocoded",
    "upvotes": 3,
    "downvotes": 0,
    "rawMessage": "Malča-prosek radar"
  }
]
```

---

## Map (public)
Rate-limited per IP.

### `GET /api/map/reports`
Public map feed.

**Query params** — same as `GET /api/events/map` above.

**Response** — same `MapEventDto[]` shape.

---

### `POST /api/map/reports`
Submit a public web report.

**Request**
```json
{
  "eventType": "radar",
  "locationText": "Bulevar Nemanjica",
  "senderName": "anonymous",
  "description": "kamera na semaforu",
  "lat": 43.32,
  "lng": 21.89,
  "recaptchaToken": "03AGdBq..."
}
```
> `locationText` is required. All other fields are optional.

**Response**
```json
{ "id": "uuid", "moderationStatus": "pending_review" }
```

---

### `POST /api/map/reports/:id/vote`
Upvote or downvote a report. Keyed by IP + report ID.

**Request**
```json
{ "vote": "up" }
```

**Response**
```json
{ "id": "uuid", "upvotes": 5, "downvotes": 1 }
```

---

### `POST /api/map/subscriptions`
Subscribe to push notifications for a geographic zone.

**Request**
```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  },
  "zoneLat": 43.32,
  "zoneLng": 21.89,
  "radiusMeters": 5000
}
```
> `radiusMeters` range: 300–100000.

**Response**
```json
{ "status": "subscribed" }
```

---

### `DELETE /api/map/subscriptions`
Unsubscribe from push notifications.

**Request**
```json
{ "endpoint": "https://fcm.googleapis.com/..." }
```

**Response**
```json
{ "status": "unsubscribed" }
```

---

## Admin
Auth: `Authorization: Bearer <admin-token>`

### `GET /api/admin/events`
Paginated, filterable event list.


### `GET /api/admin/events/:id/activity-log`
Get activity log entries for one event.

**Response**
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

---

### `GET /api/admin/events/confirm-location-candidates`
Returns grouped candidates for bulk location confirmation.

**Response**
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

---
| Param | Type | Values |
|-------|------|--------|
| `status` | string | `auto_approved`, `pending_review`, `approved`, `rejected` |

### `POST /api/admin/events/:id/confirm-location`
Confirm event location and write/update geocoding cache.

**Request**
```json
{
  "locationText": "Bulevar Nemanjica",
  "latitude": 43.321,
  "longitude": 21.896,
  "confirmedBy": "admin"
}
```

**Response**
```json
{ "id": "uuid", "cached": true }
```

---

### `POST /api/admin/events/bulk-confirm-location`
Bulk confirm event locations and upsert corresponding geocoding cache entries.

**Request**
```json
{
  "eventIds": ["uuid1", "uuid2", "uuid3"],
  "confirmedBy": "admin"
}
```

**Response**
```json
{ "confirmed": 3, "cached": 2 }
```

---
| `parseStatus` | string | `parsed`, `no_match`, `partial` |
| `enrichStatus` | string | `pending`, `enriched`, `failed` |
| `since` | ISO8601 | — |

### `GET /api/admin/geocoding-cache`
Paginated geocoding cache list for admin moderation.

**Query params**
| Param | Type | Values / Notes |
|-------|------|----------------|
| `search` | string | Full-text search over `location_text`, `normalized_text`, `formatted_addr` |
| `verified` | string | `true`, `false` |
| `sortBy` | string | `hit_count`, `created_at`, `updated_at`, `location_text`; aliases: `hitCount`, `createdAt`, `updatedAt`, `locationText` |
| `sortOrder` | string | `asc`, `desc` (case-insensitive) |
| `page` | number | default `1` |
| `limit` | number | 1–100, default `20` |

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "location_text": "Bulevar Nemanjica",
      "lat": 43.321,
      "lng": 21.896,
      "hit_count": 15,
      "verified": true,
      "formatted_addr": "Bulevar Nemanjica, Nis",
      "created_at": "2026-03-10T12:00:00Z",
      "updated_at": "2026-03-15T08:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### `PATCH /api/admin/geocoding-cache/:id`
Update one geocoding cache entry.

**Request** (all fields optional)
```json
{
  "locationText": "Bulevar Nemanjica",
  "lat": 43.321,
  "lng": 21.896,
  "verified": true,
  "formattedAddr": "Bulevar Nemanjica, Nis"
}
```

**Response**
```json
{ "id": "uuid" }
```

---

### `DELETE /api/admin/geocoding-cache/:id`
Delete one geocoding cache entry.

**Response**
```json
{ "deleted": true }
```

---
| `page` | number | default `1` |
| `limit` | number | 1–100, default `20` |
| `search` | string | Full-text search |

---

### `GET /api/admin/events/:id`
Get a single event by ID.

---

### `PATCH /api/admin/events/:id`
Manually correct event fields.

**Request**
```json
{
  "eventType": "radar",
  "locationText": "Malča-prosek",
  "senderName": "listener_01",
  "description": "kamera na mostu"
}
```

**Response**
```json
{ "id": "uuid" }
```

---

### `POST /api/admin/events/:id/approve`
Approve a pending event.

**Request**
```json
{ "moderatedBy": "admin@radar.rs", "note": "verified" }
```

**Response**
```json
{ "id": "uuid", "moderation_status": "approved" }
```

---

### `POST /api/admin/events/:id/reject`
Reject a pending event.

**Request**
```json
{ "moderatedBy": "admin@radar.rs", "note": "spam" }
```

**Response**
```json
{ "id": "uuid", "moderation_status": "rejected" }
```

---

### `GET /api/admin/stats`
Admin-level statistics view.

---

### `POST /api/admin/events/:id/re-enrich`
Trigger AI enrichment retry for a single event.

**Response**
```json
{ "id": "uuid", "enrich_status": "pending" }
```

---

### `POST /api/admin/events/re-enrich-batch`
Bulk re-trigger AI enrichment for matching events.

**Request** (all fields optional)
```json
{
  "status": "pending_review",
  "eventType": "unknown",
  "enrichStatus": "failed",
  "since": "2026-03-01T00:00:00Z",
  "until": "2026-03-13T00:00:00Z",
  "includeRejected": "false",
  "limit": 100
}
```

**Response**
```json
{ "updated": 42 }
```

---

## Processing / Dev
Only accessible in dev/backfill mode (see guards).

### `POST /api/processing/dev/run-once`
Manually triggers one batch of the processing pipeline (parse → enrich → geocode).

**Response**
```json
{
  "status": "done",
  "request_id": "uuid",
  "claimed_count": 10,
  "processed_count": 9,
  "failed_count": 1,
  "duration_ms": 1234
}
```

---

### `POST /api/processing/dev/backfill`
Replays already-processed events (e.g. to re-publish to realtime).

**Query params**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max events to replay (default `50`) |
| `start` | ISO8601 | Replay events from this date |

**Response**
```json
{
  "status": "done",
  "request_id": "uuid",
  "replayed": 50,
  "errors": 0,
  "duration_ms": 890
}
```
