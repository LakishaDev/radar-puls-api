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

## Progress Update (2026-03-12)

- Re-ran step 1 from Ubuntu WSL session.
- Result: `docker --version` still unavailable in distro; Docker Desktop WSL integration remains required blocker.
- Local fallback prep completed without Docker:
  - Native Linux Node/npm installed (`/usr/bin/node`, `/usr/bin/npm`).
  - Dependencies installed (`/usr/bin/npm install`).
  - Build validated (`/usr/bin/npm run build`).
- E2E check run:
  - 5/6 tests passed.
  - Burst test (`100 requests in 10s`) failed once with `ECONNRESET`.

## Progress Update (2026-03-12, resumed)

- Step 1 now fully passed after user enabled WSL integration:
  - `docker --version` OK
  - `docker compose version` OK
- Step 5 executed successfully:
  - `docker compose up -d --build` completed.
  - Migrations applied after data-source migration glob fix.
  - `GET /health` returned 200.
  - `POST /api/events/viber` returned accepted contract payload.
- Operational note:
  - In current shell, docker commands require `sudo` due docker.sock permission.

## Progress Update (2026-03-12, post docker-group)

- User added account to docker group; verified docker usage without sudo.
- `docker ps` and `docker compose ps` both pass without sudo.
- Dev UX refinement applied:
  - `npm run docker:migrate` now uses `docker compose exec -T api ...` (non-interactive stability).
- README updated with WSL troubleshooting notes (integration + docker group steps).
- Shell note:
  - docker group membership is persistent, but some sessions require reopening terminal (or `newgrp docker`) for non-sudo docker commands.

## Execution Plan

1. Environment check

- Verify: docker --version
- Verify: docker compose version

Status: Completed on 2026-03-12 after Docker Desktop WSL integration was enabled.

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

Status: Completed on 2026-03-12 (using `sudo docker compose ...` in this shell).

Updated status: Completed and verified with regular `docker compose ...` after docker-group refresh.

6. Developer UX

- Add Makefile or npm scripts for:
  - up
  - down
  - logs
  - migrate

Status: Completed and validated on 2026-03-12.

7. Documentation update

- Update README with exact Docker local workflow.

Status: Completed on 2026-03-12 with WSL troubleshooting additions.

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
