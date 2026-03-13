# TASKS.md

# Development Task Checklist

This checklist is organized in execution order, not fantasy order.

---

## Phase 1 — Android Listener App

### Project foundation
- [ ] Create Flutter project
- [ ] Add Riverpod
- [ ] Add GoRouter
- [ ] Add Dio
- [ ] Add Freezed + json_serializable
- [ ] Add Isar or Hive
- [ ] Setup linting and formatter
- [ ] Configure folder structure by feature

### Theme and UI shell
- [ ] Create dark Material 3 theme
- [ ] Define color tokens
- [ ] Define typography scale
- [ ] Create reusable card component
- [ ] Create reusable section header
- [ ] Create reusable status badge
- [ ] Create app router
- [ ] Add bottom nav or tab structure if needed

### Screens
- [ ] Build splash/startup screen
- [ ] Build home/status screen
- [ ] Build settings screen
- [ ] Build logs screen
- [ ] Add loading states
- [ ] Add empty states
- [ ] Add validation states

### Settings feature
- [ ] Create settings model
- [ ] Save webhook URL
- [ ] Save API key
- [ ] Save source name
- [ ] Add form validation
- [ ] Add “send test webhook” action

### Event model
- [ ] Define NotificationEvent model
- [ ] Define EventStatus enum
- [ ] Add serialization
- [ ] Add helpers for display formatting

### Local persistence
- [ ] Create local storage adapter
- [ ] Save event before network send
- [ ] Query recent events for logs
- [ ] Update status after delivery
- [ ] Store error message on failure
- [ ] Increment attempt count

### Android native listener
- [ ] Create Kotlin NotificationListenerService
- [ ] Register service in Android manifest
- [ ] Filter only `com.viber.voip`
- [ ] Extract title from notification extras
- [ ] Extract text from notification extras
- [ ] Extract postTime/packageName
- [ ] Safely handle null notification fields
- [ ] Bridge event to Flutter via channel

### Webhook client
- [ ] Create Dio client
- [ ] Add JSON headers
- [ ] Add bearer token header
- [ ] Add timeout handling
- [ ] Map success response
- [ ] Map failure response
- [ ] Log last successful delivery time

### Delivery pipeline
- [ ] Save event as pending
- [ ] Attempt immediate send
- [ ] Mark sent on success
- [ ] Mark failed on error
- [ ] Surface result in logs screen

### Retry system
- [ ] Create retry worker/service
- [ ] Retry failed and pending events
- [ ] Respect max attempts
- [ ] Add exponential backoff
- [ ] Update timestamps on each retry
- [ ] Stop retry after terminal failure threshold

### Permissions and device guidance
- [ ] Detect notification listener status
- [ ] Add instructions to enable listener access
- [ ] Add instructions to disable battery optimization
- [ ] Add startup warning if configuration is incomplete
- [ ] Add health check indicator on home screen

### Quality control
- [ ] Test with real Viber notifications
- [ ] Test with no internet
- [ ] Test app reopen after failure
- [ ] Test duplicate quick notifications
- [ ] Test long messages
- [ ] Test muted vs unmuted group behavior
- [ ] Test phone restart behavior

### Phase 1 done when
- [ ] App receives Viber notification
- [ ] Event appears in logs
- [ ] Event is sent to webhook
- [ ] Failures are retried
- [ ] Operator can see status from UI

---

## Phase 2 — Backend Ingestion

### API foundation
- [ ] Create backend project
- [ ] Add environment config
- [ ] Add request validation
- [ ] Add auth middleware
- [ ] Add structured logging

### Webhook endpoint
- [ ] Create `POST /api/events/viber`
- [ ] Validate payload format
- [ ] Validate auth token
- [ ] Return clean success/error responses

### Raw storage
- [ ] Create raw events table
- [ ] Persist every incoming event
- [ ] Add created_at / received_at handling
- [ ] Add processing_status

### Device management
- [ ] Track source devices
- [ ] Allow device identification
- [ ] Reject unknown device if needed

### Phase 2 done when
- [ ] Backend accepts webhook
- [ ] Raw events are stored
- [ ] Invalid payloads are rejected cleanly

---

## Phase 3 — Parsing and Normalization

### Classification
- [ ] Build keyword detector for radar/police/etc
- [ ] Add simple type classification
- [ ] Add irrelevant message filter

### Location extraction
- [ ] Extract location phrase
- [ ] Normalize common local place names
- [ ] Build synonym dictionary
- [ ] Add confidence scoring

### AI fallback
- [ ] Add optional LLM fallback parser
- [ ] Return structured JSON
- [ ] Store parse confidence

### Phase 3 done when
- [ ] Raw text becomes structured report candidate

---

## Phase 4 — Geocoding

- [ ] Integrate Nominatim or equivalent
- [ ] Convert location text to coordinates
- [ ] Store geocoding confidence
- [ ] Handle ambiguous results
- [ ] Handle failed geocoding gracefully

### Phase 4 done when
- [ ] Structured report includes lat/lng

---

## Phase 5 — Database and Report Lifecycle

- [ ] Setup PostgreSQL
- [ ] Enable PostGIS
- [ ] Create reports table
- [ ] Link reports to raw events
- [ ] Add created_at
- [ ] Add expires_at
- [ ] Add verification_status
- [ ] Add deduplication logic

### Phase 5 done when
- [ ] Reports can be stored and queried spatially

---

## Phase 6 — Map and Admin

### Admin panel
- [ ] Build internal dashboard
- [ ] Show incoming reports
- [ ] Show raw message vs parsed output
- [ ] Allow manual correction
- [ ] Allow reject/approve flow

### Public map
- [ ] Build map frontend
- [ ] Render active reports
- [ ] Filter by type
- [ ] Filter by recency
- [ ] Show confidence badge

### Phase 6 done when
- [ ] Reports are visible on map and manageable from admin

---

## Phase 7 — Hardening

- [ ] Add rate limiting
- [ ] Add replay protection if needed
- [ ] Add monitoring
- [ ] Add crash/error reporting
- [ ] Add backup strategy
- [ ] Add device health monitoring
- [ ] Add stale report cleanup job

---

## Final Note

Do not start Phase 3 before Phase 1 actually works on a real device.  
Anything else is fake progress.
