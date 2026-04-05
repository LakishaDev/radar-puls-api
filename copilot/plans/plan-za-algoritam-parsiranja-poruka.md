# Plan: Viber Triplet Parsing & Self-Learning Enrichment Cache

## TL;DR

Restructure Viber message ingestion to handle pre-grouped message triplets (sender, text, time) instead of raw individual texts. Add keyword-based event detection (regex rules) BEFORE AI enrichment to maximize cache hits and minimize OpenAI calls. Implement a self-learning enrichment cache that grows from verified AI results and admin corrections. Simplify the AI prompt to no longer extract senderName.

**Both projects need changes:** The Android listener must group accessibility texts into triplets and detect the group name; the API must accept the structured format, add enrichment caching layers, and simplify the AI prompt.

---

## Phase 1: Android Listener - Triplet Grouping (prerequisite, separate project)

**Project:** `/mnt/c/Users/lazar/Desktop/PROJEKTI/LAKISHADEV/RadarPuls/radar-puls-listener`

### Step 1.1: Accessibility Group Name Detection

**File:** `android/app/src/main/kotlin/.../ViberAccessibilityService.kt`

- In `processCurrentWindow()`, before `collectTexts()`, traverse root to find the chat header/title node
- Viber's chat title is typically the first `TextView` in the toolbar area or the first large text node near the top
- Store current group name in a field: `private var currentGroupName: String = "unknown"`
- Include `currentGroupName` in the emitted data to Flutter

### Step 1.2: Triplet Grouping in Flutter

**File:** `lib/features/listener/application/viber_listener_runtime.dart`

- Replace the `for (final text in messages)` individual processing loop
- Add a triplet grouping function:

**Algorithm (time-anchor based):**

1. Receive `List<String>` from accessibility stream
2. Identify time markers: elements matching `^\d{1,2}:\d{2}$` exactly
3. Split the list into groups, where each time marker ENDS a group
4. For each group:
   - `time` = the time marker (last element)
   - If 1 element before time → `sender=null`, `text=that element`
   - If 2 elements before time → `sender=first`, `text=second`
   - If 3+ elements before time → `sender=first`, `text=join rest with space`
   - If 0 elements before time → skip (orphan time)
5. Texts that appear AFTER the last time marker → buffer for next snapshot

### Step 1.3: Updated API Payload

**File:** `lib/features/listener/data/webhook_client.dart`

- Change payload format per message:

```json
{
  "source": "viber_listener_android",
  "group": "<detected group name>",
  "sender_name": "Marko",
  "message": "radar kod delte",
  "message_time": "16:42",
  "timestamp": "2026-04-03T14:42:00Z",
  "device_id": "android_listener_01"
}
```

### Step 1.4: Batch Endpoint (optional optimization)

- Send all grouped messages from one snapshot in a single API call:

```json
{
  "source": "viber_listener_android",
  "group": "Radar Nis",
  "device_id": "android_listener_01",
  "messages": [
    {
      "sender_name": "Marko",
      "text": "radar kod delte",
      "message_time": "16:42"
    },
    {
      "sender_name": null,
      "text": "guzva na bulevaru",
      "message_time": "16:43"
    }
  ]
}
```

---

## Phase 2: API - Updated Ingestion Endpoint & DTO

**Project:** `/home/lazar/projekti/radar-puls/radar-puls-api`

### Step 2.1: Update CreateViberEventDto

**File:** `src/events/dto/create-viber-event.dto.ts`

- Add optional fields:
  - `sender_name?: string` — extracted sender name from triplet
  - `message_time?: string` — HH:MM time from the message UI
- Keep existing fields (`source`, `group`, `message`, `timestamp`, `device_id`) for backward compatibility

### Step 2.2: (Optional) Add batch ingestion endpoint

**File:** `src/events/events.controller.ts`

- New endpoint: `POST /api/events/viber-batch`
- Accepts array of messages with shared `source`, `group`, `device_id`
- Iterates and creates individual `RawEventEntity` per message
- Stores `sender_name` and `message_time` as new columns on `raw_events`

### Step 2.3: Update RawEventEntity

**File:** `src/database/raw-event.entity.ts`

- Add columns: `sender_name` (nullable string), `message_time` (nullable string)
- Migration to add columns

### Step 2.4: Update ParsingContext

**File:** `src/parsing/types.ts`

- Add `senderName?: string` and `messageTime?: string` to `ParsingContext`
- These flow from the raw event through processing

### Step 2.5: Update ProcessingService

**File:** `src/processing/processing.service.ts`

- In `processEvent()`, pass `sender_name` and `message_time` from `ClaimedEvent` into `ParsingContext`
- The `rawMessage` field already contains only the message text (not sender/time)

---

## Phase 3: API - Keyword-Based Event Detection (Cache Level 1)

**Goal:** Detect event type from message text using regex rules BEFORE sending to AI. Handles ~80% of messages without AI.

### Step 3.1: Create KeywordParsingService

**File:** `src/parsing/keyword-parsing.service.ts` (new)

- Define keyword → eventType mapping (extracted from current AI prompt):
  ```
  control → /duvaljka|alkotest|pus[eu]|zaustavljaju|kontrola/i
  police  → /murija|policija|mup|saobraćajci|patrola|panduri/i
  radar   → /radar|laser|merenje|brzin/i
  traffic_jam → /guzva|kolona|stoji|kolaps|zastoj/i
  accident → /sudar|udes|cukanje|pao|oboren|prevrnuo/i
  ```
- Method: `detectEventType(text: string): { eventType: string, confidence: number } | null`
- Returns first match with confidence 70-85 (keyword match, not AI-level)
- Returns null if no keyword matched → falls through to AI

### Step 3.2: Create LocationExtractionService (regex-based)

**File:** `src/parsing/location-extraction.service.ts` (new)

- Extract location text by removing event keywords and prepositions
- Prepositions to strip: `kod`, `na`, `preko puta`, `ispred`, `iza`, `posle`, `pre`, `blizu`, `pored`
- Method: `extractLocation(text: string, eventType: string): string | null`
- Example: "radar kod delte" → strip "radar" and "kod" → "delte"
- The extracted location then goes through existing geocoding cascade

### Step 3.3: Integrate into ParsingService

**File:** `src/parsing/parsing.service.ts`

- After readability check, call `keywordParsingService.detectEventType()`
- If detected, call `locationExtractionService.extractLocation()`
- Set `eventType`, `locationText`, `confidence` on ParsingResult
- Set a new field `parseMethod: 'keyword' | 'ai' | 'cache'` to track how it was parsed

---

## Phase 4: API - Enrichment Cache (Self-Learning, Cache Level 2)

**Goal:** Cache AI enrichment results so identical/similar messages skip AI entirely.

### Step 4.1: Create EnrichmentCacheEntity

**File:** `src/database/enrichment-cache.entity.ts` (new)

- Table: `enrichment_cache`
- Columns:
  - `id` (uuid, PK)
  - `normalized_text` (string, unique index) — normalized message text
  - `event_type` (string)
  - `location_text` (string, nullable)
  - `confidence` (int)
  - `hit_count` (int, default 0)
  - `verified` (boolean, default false)
  - `source` ('ai' | 'keyword' | 'admin')
  - `created_at`, `updated_at`

### Step 4.2: Create EnrichmentCacheService

**File:** `src/enrichment/enrichment-cache.service.ts` (new)

- `findCached(normalizedText: string): EnrichmentCacheEntry | null`
  - Exact match on `normalized_text`
  - Increment `hit_count` on hit
  - Return only if `verified=true` OR `hit_count >= 3` (unverified but repeated)
- `upsertFromAI(normalizedText, result)`: Store AI result as unverified
- `upsertFromAdmin(normalizedText, result)`: Store as verified
- `markVerified(id)`: Promote entry to verified

### Step 4.3: Integrate into EnrichmentService

**File:** `src/enrichment/enrichment.service.ts`

- In `enrichEvent()`, BEFORE calling `extractStructuredData()` (OpenAI):
  1. Normalize the raw message text
  2. Check `enrichmentCacheService.findCached(normalizedText)`
  3. If cache hit → use cached `eventType`, `locationText`, `confidence`; skip AI entirely
  4. Set `enrich_source: 'cache'` to track
  5. If cache miss → proceed to AI as before
  6. After successful AI enrichment → `upsertFromAI()` to cache the result

### Step 4.4: Admin Cache Management

**File:** `src/admin/admin.controller.ts` + `admin.service.ts`

- Add endpoints for enrichment cache management (similar to existing geocoding cache endpoints):
  - `GET /api/admin/enrichment-cache` — list/search
  - `PATCH /api/admin/enrichment-cache/:id` — edit/verify
  - `DELETE /api/admin/enrichment-cache/:id` — remove bad entries
- When admin edits an event's eventType/locationText → auto-upsert to enrichment cache as verified

---

## Phase 5: API - Simplified AI Prompt

### Step 5.1: Remove senderName from AI Prompt

**File:** `src/enrichment/enrichment.service.ts` (method: `extractStructuredData`)

- Remove the `senderName` section from the system prompt
- Remove `senderName` from the expected JSON response schema
- The sender is now provided by the listener's triplet grouping, stored in `sender_name` column on raw_events, and carried through to parsed_events

### Step 5.2: Update ParsedEventEntity

**File:** `src/database/parsed-event.entity.ts`

- The `sender_name` field now comes from the raw event (listener-provided) instead of AI extraction
- In `persistParsed()`, set `sender_name` from `ParsingContext.senderName` rather than leaving it for AI

### Step 5.3: Updated AI JSON Schema

- New prompt asks for only:

```json
{
  "locationText": "string|null",
  "eventType": "police|accident|traffic_jam|radar|control|unknown",
  "confidence": 0-100
}
```

---

## Phase 6: API - Known Senders Cache (Optional Enhancement)

### Step 6.1: Known Senders Table

**File:** `src/database/known-sender.entity.ts` (new)

- Table: `known_senders`
- Columns: `id`, `name` (unique), `normalized_name`, `message_count` (auto-increment on match), `created_at`
- Auto-populated: when a `sender_name` comes from the listener, upsert into this table
- Used for validation: if listener sends a suspicious sender name that matches no known sender AND looks like a traffic message, flag it

### Step 6.2: Admin Sender Management

- Endpoint: `GET /api/admin/known-senders` — list known senders
- Endpoint: `DELETE /api/admin/known-senders/:id` — remove false positives

---

## Relevant Files

### API (modify)

- `src/events/dto/create-viber-event.dto.ts` — add `sender_name`, `message_time` fields
- `src/events/events.controller.ts` — optional batch endpoint
- `src/events/events.service.ts` — pass new fields to raw event
- `src/database/raw-event.entity.ts` — add `sender_name`, `message_time` columns
- `src/parsing/types.ts` — extend `ParsingContext` and `ParsingResult`
- `src/parsing/parsing.service.ts` — integrate keyword detection + location extraction
- `src/processing/processing.service.ts` — pass sender/time through pipeline
- `src/enrichment/enrichment.service.ts` — add cache check before AI, simplify prompt
- `src/database/parsed-event.entity.ts` — sender_name now from listener, not AI
- `src/admin/admin.controller.ts` + `admin.service.ts` — enrichment cache admin endpoints

### API (create new)

- `src/parsing/keyword-parsing.service.ts` — regex event type detection
- `src/parsing/location-extraction.service.ts` — regex location extraction
- `src/enrichment/enrichment-cache.service.ts` — enrichment result cache
- `src/database/enrichment-cache.entity.ts` — enrichment cache table

### Listener (modify)

- `android/.../ViberAccessibilityService.kt` — detect group name from UI tree
- `lib/features/listener/application/viber_listener_runtime.dart` — triplet grouping algorithm
- `lib/features/listener/data/webhook_client.dart` — updated payload format

---

## Verification

1. **Unit tests** for triplet grouping algorithm (various edge cases: missing sender, multi-line messages, orphan times, consecutive same sender)
2. **Unit tests** for keyword detection service (all event type keywords, edge cases, false positives)
3. **Unit tests** for location extraction (with/without prepositions, various formats)
4. **E2E test** for new ingestion endpoint: send structured payload → verify raw_event has sender_name and message_time
5. **E2E test** for enrichment cache: send same message twice → verify second skips AI (mock OpenAI, assert not called)
6. **E2E test** for keyword path: send "radar kod delte" → verify eventType=radar without AI call
7. **Manual test**: send real Viber-like messages from listener → check full pipeline
8. **Backward compatibility test**: old payload format (without sender_name/message_time) still works

---

## Decisions

- **Grouping happens on listener side** (not API) because the accessibility tree gives guaranteed order; API-side buffering would be fragile with network delays and interleaving
- **Time pattern `^\d{1,2}:\d{2}$` is the message delimiter** — it's the most reliable anchor since every Viber message has a time, and standalone time strings don't appear in message text (they'd be part of a longer node)
- **Enrichment cache uses exact normalized match** (not fuzzy) for v1 — simple, fast, no false positives. Fuzzy matching can be added later
- **Keyword detection confidence capped at 85** — high enough to be useful but leaves room for AI to "outrank" if needed
- **Backward compatible** — existing payloads without sender_name/message_time still work (fields are optional)
- **Phase 6 (Known Senders) is optional** — can be deferred; sender from listener is sufficient for v1

## Accessibility Reader Ordering Answer

The Android AccessibilityService uses **depth-first pre-order traversal** (`collectTexts` in ViberAccessibilityService.kt iterates children 0→N, recursing into each). This means text is collected **top-to-bottom, left-to-right** — the same visual order as the Viber chat UI. Messages in Viber display chronologically (oldest at top, newest at bottom), so the triplets (sender → text → time) come in reliable sequential order. This is NOT random.

## Implementation Order

Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6(optional) → Phase 1(listener)
Phases 2-5 can be implemented on the API first with mock/manual testing. Phase 1 (listener) can be done in parallel but is needed for production.
