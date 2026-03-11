# Backend Phase 2 Plan

Date: 2026-03-11

## Objective

Build a stable ingestion API that receives Viber events from mobile listener and stores raw events for downstream processing.

## Deliverables

1. API service skeleton with env-based config.
2. Database schema for raw events.
3. Auth middleware for bearer token.
4. `POST /api/events/viber` endpoint.
5. Deterministic response model and error mapping.
6. Minimal observability (structured logs + request id).

## API Contract

### Endpoint

`POST /api/events/viber`

### Required Headers

- `Content-Type: application/json`
- `Authorization: Bearer <token>`

### Request Body

```json
{
  "source": "viber_listener_android",
  "group": "Radar Nis",
  "message": "Policija kod Delte",
  "timestamp": "2026-03-09T14:22:00Z",
  "device_id": "android_listener_01"
}
```

### Validation Rules

- `source` required, non-empty
- `group` required, non-empty
- `message` required, non-empty
- `timestamp` required, ISO-8601 parseable
- `device_id` required, non-empty

### Response Mapping

- `200`: accepted and stored
- `400`: invalid payload
- `401`: unauthorized
- `429`: rate-limited
- `500`: internal server failure

## Database (Raw Events)

Table: `raw_events`

- `id` (uuid, pk)
- `source` (text)
- `group_name` (text)
- `raw_message` (text)
- `received_at` (timestamptz)
- `created_at` (timestamptz default now)
- `device_id` (text)
- `processing_status` (text default `pending`)

Indexes:

- `idx_raw_events_created_at`
- `idx_raw_events_processing_status`
- `idx_raw_events_device_id`

## Test Gates (must pass)

1. Valid payload with valid token returns 200 and row inserted.
2. Missing required field returns 400.
3. Invalid token returns 401.
4. Simulated burst traffic handled without crashes.
5. Database unavailable returns 500 with safe error body.
