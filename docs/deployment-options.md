# Deployment Plan: radar-puls-api

## Kritična analiza: Cloudflare Workers kompatibilnost

Tvoj projekat koristi:
- **NestJS + Express** (HTTP server framework)
- **PostgreSQL** (TypeORM, direktna konekcija)
- **Socket.IO** (WebSocket server)
- **Long-running worker procesi** (polling loop-ovi za processing i enrichment)
- **OpenAI API** pozive

**Cloudflare Workers imaju fundamentalna ograničenja** za ovaj tip aplikacije:

| Feature | Tvoj projekat | CF Workers podrška |
|---|---|---|
| NestJS/Express | Da | **NE** — CF Workers nisu Node.js server, nego serverless edge funkcije |
| PostgreSQL (TCP) | Da | Delimično — preko Hyperdrive, ali TypeORM nije kompatibilan |
| Socket.IO | Da | **NE** — zahteva Durable Objects + custom WebSocket protokol |
| Long-running procesi | Da (worker, enrichment polling) | **NE** — max 30s CPU, max 15min sa Cron Triggers |
| Node.js full API | Da | Delimično — `node_compat` režim pokriva ~70% API-ja |

**Zaključak**: Deploy na CF Workers zahteva **kompletno prepisivanje aplikacije** (~80% koda), ne samo CI/CD pipeline.

---

## Opcija 1: Cloudflare Workers (TEŠKA — kompletni refactor)

Ako insistiraš na CF Workers, evo šta bi bilo potrebno:

### Faza 1: Refactor API-ja (2–3 nedelje)

1. Zameni NestJS sa **Hono** (lightweight framework koji radi na CF Workers)
2. Zameni TypeORM sa **Drizzle ORM** + **Neon Serverless driver** (ili koristi CF Hyperdrive za PostgreSQL)
3. Zameni Socket.IO sa **Durable Objects** za WebSocket konekcije
4. Svaki endpoint postaje edge function

### Faza 2: Refactor Worker procesa

1. Polling worker → **CF Cron Triggers** (pokreće se periodično, max 15min)
2. Enrichment worker → **CF Queues** + consumer worker
3. Backfill → **CF Queue batch processing**

### Faza 3: CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare Workers
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
```

**Potrebni fajlovi:**
- `wrangler.toml` — CF Workers konfiguracija
- Potpuno novi router layer (Hono)
- Durable Objects klase za WebSocket
- Queue handlers za worker procese

> **Procena**: Ovo je suštinski **nova aplikacija** sa potpuno drugačijom arhitekturom.

---

## Opcija 2: VPS + Docker + GitHub Actions ✅ PREPORUČENO

Ovo je **najbolja opcija** za tvoju arhitekturu. Tvoj projekat je već Dockerizovan.

### Infrastruktura

- **Hetzner Cloud** VPS (CX22 — €4.5/mesečno, 2 vCPU, 4GB RAM) ili **DigitalOcean** Droplet
- PostgreSQL na istom VPS-u ili managed (Neon free tier / Supabase)
- Nginx reverse proxy + Let's Encrypt SSL

### GitHub Actions CI/CD pipeline

```yaml
# .github/workflows/deploy.yml
name: Build & Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: radar_puls_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - run: npm test
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/radar_puls_test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:latest

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/radar-puls
            docker compose pull
            docker compose up -d --remove-orphans
            docker compose exec -T api npm run migration:run
```

### Secrets koje treba dodati u GitHub repo

| Secret | Opis |
|---|---|
| `SERVER_HOST` | IP adresa VPS-a |
| `SERVER_USER` | SSH korisnik (npr. `ubuntu`) |
| `SSH_PRIVATE_KEY` | Privatni SSH ključ |

### Prednosti

- Zero refactoring — tvoj kod radi kako jeste
- WebSocket, worker procesi, PostgreSQL — sve radi
- Puna kontrola nad serverom
- Jeftino (€4.5–10/mesečno)

---

## Opcija 3: Fly.io (dobar kompromis)

**Fly.io** podržava Docker kontejnere na edge lokacijama.

```yaml
# .github/workflows/deploy.yml
name: Deploy to Fly.io
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**Potrebni fajlovi:**
- `fly.toml` sa konfiguracijom
- Production `Dockerfile`

### Prednosti / Mane

| + | - |
|---|---|
| Gotovo zero config deploy | Free tier je ograničen |
| Podržava PostgreSQL (Fly Postgres) | Cene rastu sa skaliranjem |
| WebSocket podrška | |
| Podržava multiple procese (api + worker) | |

---

## Opcija 4: Railway / Render

Slično Fly.io, ali sa web dashboard-om:
- **Railway**: Direktan deploy iz GitHub-a, PostgreSQL addon, ~$5/mesečno
- **Render**: Free tier za web services, managed PostgreSQL

---

## Opcija 5: Hybrid — CF kao proxy, VPS za API ✅ PREPORUČENO

Ako želiš Cloudflare u miksu bez refactoring-a:

1. **Cloudflare** kao CDN/proxy — domen + SSL + DDoS zaštita + caching (besplatno)
2. **VPS** za NestJS API + PostgreSQL (€4.5/mesečno)
3. Cloudflare DNS usmeri ka VPS-u (orange cloud proxy)

Ovo ti daje **Cloudflare zaštitu i performanse** bez ijedne izmene u kodu.

---

## Preporuka

**Opcija 2 + Opcija 5 kombinovano** (VPS + Docker + GitHub Actions + Cloudflare proxy):

| Razlog | Objašnjenje |
|---|---|
| Zero refactoring | NestJS + TypeORM + Socket.IO stack radi identično |
| Svi procesi rade | API, worker, enrichment, backfill — bez ograničenja |
| Troškovi | Hetzner CX22 je €4.5/mesečno, bez iznenađenja |
| Kontrola | SSH pristup, logovi, debug mogućnosti |
| Cloudflare zaštita | SSL, DDoS zaštita, caching — besplatno kao proxy sloj |

### Redosled implementacije

1. Kreirati production `Dockerfile`
2. Kreirati `docker-compose.prod.yml`
3. Podesiti VPS (Hetzner/DigitalOcean) + Nginx + SSL
4. Dodati GitHub Secrets (`SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`)
5. Kreirati `.github/workflows/deploy.yml`
6. Podesiti Cloudflare DNS + proxy za domen
