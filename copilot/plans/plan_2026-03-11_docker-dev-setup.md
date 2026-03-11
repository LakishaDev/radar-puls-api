# Plan - Docker Local Dev Setup (Next Step)

Date: 2026-03-11
Status: In progress

## Goal

Set up full local development stack using Docker for radar-puls-api (non-production):

- Postgres container
- API service container
- one-command up/down workflow

## Preconditions (must pass first)

1. Docker CLI must be callable from active terminal.
2. Docker Compose v2 must be available.
3. If using WSL, install and use Ubuntu distro integrated with Docker Desktop.

## Progress Update (2026-03-11)

- Step 1 completed: `docker --version` and `docker compose version` are available in current shell.
- Docker dev files added: `docker-compose.yml`, `Dockerfile.dev`.
- Env/docs/scripts aligned for compose workflow.
- Current WSL blocker: only `docker-desktop` distro exists; Docker CLI from that distro is unsupported by Docker Desktop.
- Next required action for WSL-first workflow: install and integrate Ubuntu (or another user distro) with Docker Desktop.

## Execution Plan

1. Environment check

- Verify: docker --version
- Verify: docker compose version

2. Compose setup

- Add docker-compose.yml with services:
  - db (postgres)
  - api (Nest app)
- Configure network and named volume for DB persistence.

3. Dockerfile setup

- Add Dockerfile.dev for NestJS local development.
- Mount source code for live reload in dev mode.

4. Env alignment

- Ensure .env.example contains compose-compatible DATABASE_URL for container network.
- Ensure DEVICE_TOKENS_JSON documented and usable in container env.

5. Run + validate

- docker compose up -d --build
- Run migrations inside api container.
- Verify health endpoint and POST /api/events/viber contract manually.

6. Developer UX

- Add Makefile or npm scripts for:
  - up
  - down
  - logs
  - migrate

7. Documentation update

- Update README with exact Docker local workflow.

## Validation Checklist

- Containers start without crash loops.
- DB reachable from API container.
- Migration applies successfully.
- GET /health returns service up.
- POST /api/events/viber returns expected deterministic responses.

## Fallback if Docker still unavailable

- Use local postgres and run Nest app directly with npm run start:dev until Docker CLI access is fixed.

## First command to run after restart

- docker --version && docker compose version
