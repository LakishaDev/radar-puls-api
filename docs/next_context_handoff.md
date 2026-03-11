# Next Context Handoff (radar-puls-api)

Date: 2026-03-11

## Current State

- Repository exists but implementation code is not started.
- Documentation prepared for backend ingestion kickoff.
- Source architecture from mobile side is aligned to backend flow:
  Listener -> Webhook -> Ingestion API -> Raw Event Storage.

## Immediate Next Task

Implement backend ingestion MVP only (Phase 2):

1. Initialize project skeleton (FastAPI or NestJS).
2. Add env config (`PORT`, `DATABASE_URL`, `API_TOKEN` or device-token model).
3. Create DB migration for `raw_events` table.
4. Implement `POST /api/events/viber` with validation + auth + insert.
5. Add deterministic error responses for 400/401/500.
6. Add integration tests for contract cases.

## Constraints

- Do not implement parsing/geocoding/map in this step.
- Keep API contract compatible with listener payload.
- Keep logs structured and avoid leaking secrets.

## Copy-Paste Prompt For New Chat

Continue in `radar-puls-api` and implement Phase 2 ingestion MVP only. Start by scaffolding the backend (prefer FastAPI unless project constraints require NestJS), add env config, create migration for `raw_events`, and implement `POST /api/events/viber` with bearer auth, payload validation, and deterministic 200/400/401/500 responses. Then add integration tests for endpoint contract and document run commands in README.
