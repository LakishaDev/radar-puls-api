# Production Server Fixes & Hardening Plan

**Date**: 2026-03-15
**Server**: Hetzner CX22 (ubuntu-4gb-hel1-2) — Ubuntu 24.04, 2 vCPU, 4GB RAM, 38GB disk
**User**: `deploy` (uid=1000, docker group, sudo)
**Stack**: Docker 29.3.0, Docker Compose v5.1.0, Nginx (host), PostgreSQL 16 (container)
**Repo**: `git@github.com:LakishaDev/radar-puls-api.git`
**Public IPv6**: `2a01:4f9:c014:d418::1` (nema IPv4 — Hetzner CX22 je samo IPv6 po defaultu)

---

## Trenutno stanje — pronađeni problemi

### KRITIČNO (aplikacija ne radi potpuno)

| # | Problem | Detalji |
|---|---------|---------|
| K1 | **Worker i Enrichment kontejneri crash-loop** | Greška: `PORT has failed the following constraints: min, isInt`. Worker/enrichment nemaju `PORT` env var u `docker-compose.prod.yml`, a `env.validation.ts` ga zahteva kao obavezan (`@IsInt() @Min(1) PORT!: number`). |
| K2 | **Migracije nikad nisu pokrenute** | Baza je prazna (0 tabela). `npm run migration:run` koristi `ts-node` + `tsconfig-paths` — to su devDependencies koje ne postoje u production Docker image-u. |
| K3 | **DOMAIN env var nije setovan** | `.env` nema `DOMAIN=...`. Nginx edge template (`docker-compose.edge.yml`) ga koristi za SSL config. Bez njega SSL uopšte ne može raditi. |
| K4 | **SSL sertifikat ne postoji** | `/etc/letsencrypt/live/` ne postoji. Certbot nikad nije pokrenut. Nginx HTTPS je nefunkcionalan. |
| K5 | **Postgres password je `postgres`** | Produkcisjka baza koristi default password. Ako se ikad izloži, trivijalno je za kompromitovati. |

### OZBILJNO (bezbednost/stabilnost)

| # | Problem | Detalji |
|---|---------|---------|
| S1 | **SSH PermitRootLogin=yes** | Root login je dozvoljen. Treba disablovati. |
| S2 | **fail2ban nije aktivan** | `systemctl is-active fail2ban` → `inactive`. SSH brute-force odbrana ne postoji. |
| S3 | **Nema swap memorije** | Swap je potpuno prazan. Na 4GB RAM-u, OOM killer može ubiti kontejnere. |
| S4 | **Port 3000 je javno otvoren u UFW** | API je direktno dostupan na port 3000 zaobilazeći Nginx. Treba obrisati to UFW pravilo. |
| S5 | **Docker log rotation nije konfigurisana** | `json-file` driver bez limita. Logovi će popuniti disk. |
| S6 | **Nema IPv4 adresu** | Hetzner CX22 po default-u je IPv6-only. Ako treba IPv4 (za DNS A record, Android klijente koji ne podržavaju IPv6), mora se kupiti. |
| S7 | **WebSocket path mismatch u Nginx** | `deploy/nginx/templates/radar-puls.conf.template` proksira `/socket.io/` ali `src/main.ts` definiše Socket.IO sa `path: "/ws"`. |
| S8 | **CORS_ORIGIN je `http://localhost:3000`** | Production `.env` ima development CORS origin. |
| S9 | **Nginx na hostu je default config** | `/etc/nginx/sites-enabled/default` — samo default Ubuntu page, nije konfigurisan za reverse proxy. |
| S10 | **Nema DB backup strategije** | Nema crontab, nema backup script. |

### SREDNJE (poboljšanja)

| # | Problem | Detalji |
|---|---------|---------|
| M1 | **docker-compose.edge.yml treba se integrisati** | Nginx + Certbot iz edge fajla nisu pokrenuti — koristi se host Nginx umesto toga. Treba odlučiti: host Nginx ili container Nginx. |
| M2 | **Nema health check monitoring** | Nema ntfy/uptime-kuma/healthcheck.io za alerting kad padne. |
| M3 | **`APP_IMAGE` placeholder** | `docker-compose.prod.yml` ima `ghcr.io/owner/repo:latest` — .env ima ispravnu vrednost ali default je loš. |
| M4 | **GitHub Actions — nema migration step** | `deploy.yml` ne pokreće migracije nakon deploy-a. |
| M5 | **Nema docker prune automatizaciju** | Stare slike se akumuliraju na disku bez čišćenja. |

---

## Plan implementacije — korak po korak

Svaki zadatak ima **tačne komande** i **tačne fajlove za editovati**. Agent treba da prati redosled.

---

### FAZA 1: Popravke u kodu (push na GitHub → auto-deploy)

#### Zadatak 1.1 — Učini PORT opcionalnim za worker/enrichment

**Fajl**: `src/config/env.validation.ts`

**Promena**: Dodaj `@IsOptional()` dekorator iznad `PORT` propertija. Worker i enrichment ne slušaju HTTP port — ne treba im.

```typescript
// BEFORE:
@IsInt()
@Min(1)
PORT!: number;

// AFTER:
@IsOptional()
@IsInt()
@Min(1)
PORT?: number;
```

#### Zadatak 1.2 — Dodaj production migration skriptu (bez ts-node)

**Problem**: `npm run migration:run` koristi `ts-node` koji ne postoji u production image-u. Treba dodati skriptu koja koristi kompajlirane `.js` fajlove.

**Fajl**: `src/database/data-source.prod.ts` (NOVI FAJL)

```typescript
import "reflect-metadata";
import { DataSource } from "typeorm";
import { RawEventEntity } from "./raw-event.entity";
import { ParsedEventEntity } from "./parsed-event.entity";
import { MapPushSubscriptionEntity } from "./map-push-subscription.entity";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [RawEventEntity, ParsedEventEntity, MapPushSubscriptionEntity],
  migrations: ["dist/database/migrations/*.js"],
  synchronize: false,
});
```

**Fajl**: `package.json` — dodaj production migration skriptu:

```json
"migration:run:prod": "node ./node_modules/typeorm/cli.js -d dist/database/data-source.prod.js migration:run",
"migration:revert:prod": "node ./node_modules/typeorm/cli.js -d dist/database/data-source.prod.js migration:revert"
```

**Fajl**: `tsconfig.build.json` — PROVERI da `src/database/data-source.prod.ts` nije excludovan. Ako `exclude` polje postoji, osiguraj da se `data-source.prod.ts` kompajlira u `dist/`.

#### Zadatak 1.3 — Popravi WebSocket path u Nginx template

**Fajl**: `deploy/nginx/templates/radar-puls.conf.template`

Promeni `/socket.io/` → `/ws/` da se poklopi sa `src/main.ts` (`path: "/ws"`):

```nginx
# BEFORE:
location /socket.io/ {

# AFTER:
location /ws/ {
```

**ALTERNATIVA**: Ako se koristi default Socket.IO path, onda promeniti `main.ts` da ne setuje custom path. Ali pošto je `main.ts` izvor istine, Nginx se prilagođava.

#### Zadatak 1.4 — Dodaj PORT env u worker i enrichment u docker-compose.prod.yml

Čak i sa opcionalnim PORT-om (1.1), bolje je eksplicitno dodati `PORT: 3000` u worker i enrichment sekcije `docker-compose.prod.yml` za konzistentnost. ALI pošto radimo 1.1 da bude opcionalan, ovo je samo nice-to-have. **SKIP ako je 1.1 urađen.**

#### Zadatak 1.5 — Dodaj migration step u GitHub Actions

**Fajl**: `.github/workflows/deploy.yml`

U `deploy` job, posle `docker compose up -d`, dodaj:

```yaml
            docker compose -f docker-compose.prod.yml exec -T api npm run migration:run:prod
```

Kompletna ažurirana `script` sekcija SSH deploy step-a:

```yaml
          script: |
            set -e
            cd /opt/radar-puls

            if [ -n "$GHCR_USERNAME" ] && [ -n "$GHCR_TOKEN" ]; then
              echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
            fi

            export APP_IMAGE="ghcr.io/${IMAGE_REPO}:latest"

            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d --remove-orphans
            docker compose -f docker-compose.prod.yml exec -T api npm run migration:run:prod

            # Cleanup old images
            docker image prune -af --filter "until=168h"
```

#### Zadatak 1.6 — Osiguraj data-source.prod.ts ulazi u build

**Fajl**: `Dockerfile` — `COPY` komande su u redu jer kopiraju ceo `src/` direktorijum. Ali proveri `tsconfig.build.json`:

**Fajl**: `tsconfig.build.json` — Ako `exclude` sadrži `data-source.ts`, dodaj izuzetak. Ako sadrži samo `test` fajlove, onda je OK.

---

### FAZA 2: Server konfiguracija (SSH na produkciju)

#### Zadatak 2.1 — Kreiraj swap (2GB)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### Zadatak 2.2 — Hardening SSH

```bash
sudo sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Proveri da PasswordAuthentication ne postoji ili je no:
grep -q '^PasswordAuthentication' /etc/ssh/sshd_config && \
  sudo sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config || \
  echo 'PasswordAuthentication no' | sudo tee -a /etc/ssh/sshd_config

sudo systemctl restart sshd
```

#### Zadatak 2.3 — Aktiviraj fail2ban

```bash
sudo apt update && sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

Kreiraj custom config:
```bash
sudo tee /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
EOF

sudo systemctl restart fail2ban
```

#### Zadatak 2.4 — Konfiguriši Docker log rotation

Kreiraj `/etc/docker/daemon.json`:

```bash
sudo tee /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

sudo systemctl restart docker
```

> **PAŽNJA**: Ovo će restartovati sve kontejnere! Uradi nakon deploy-a.

#### Zadatak 2.5 — Zatvori port 3000 u UFW

```bash
sudo ufw delete allow 3000/tcp
sudo ufw reload
```

> Port 3000 koristiti samo interno (Nginx → API). Ne treba biti javno otvoren.

#### Zadatak 2.6 — Promeni Postgres password

**Korak 1**: Ažuriraj `.env` sa novom lozinkom:
```bash
# Generiši sigurnu lozinku
NEWPASS=$(openssl rand -base64 24)
echo "Nova PG lozinka: $NEWPASS"

# Update .env — promeni POSTGRES_PASSWORD i DATABASE_URL
# RUČNO editovati .env jer sadrži secrets
```

**Korak 2**: Dodaj `POSTGRES_PASSWORD` u `.env`:
```
POSTGRES_PASSWORD=<nova_lozinka>
DATABASE_URL=postgres://postgres:<nova_lozinka>@db:5432/radar_puls
```

**Korak 3**: Promeni lozinku u running Postgres:
```bash
docker exec radar-puls-db-1 psql -U postgres -c "ALTER USER postgres PASSWORD '<nova_lozinka>';"
```

**Korak 4**: Restartuj stack:
```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

#### Zadatak 2.7 — Konfiguriši host Nginx kao reverse proxy

Odluka: Koristiti **host Nginx** umesto containerized Nginx. Razlog: jednostavniji certbot setup, manje kontejnera.

**Obriši docker-compose.edge.yml** iz produkcije (ne koristiti ga). Ostavi fajl u repo-u za referencu.

Kreiraj Nginx site config:

```bash
sudo tee /etc/nginx/sites-available/radar-puls << 'NGINX'
# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name OVDE_DOMEN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name OVDE_DOMEN;

    ssl_certificate /etc/letsencrypt/live/OVDE_DOMEN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/OVDE_DOMEN/privkey.pem;

    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # WebSocket — path /ws (iz main.ts)
    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }

    # API
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Rate limiting headers
        proxy_set_header X-Request-ID $request_id;
    }
}
NGINX
```

**NAPOMENA**: Zameni `OVDE_DOMEN` sa pravim domenom (npr. `api.radarpuls.rs`). Ne aktivirati HTTPS blok dok se ne generiše SSL sertifikat (korak 2.8).

Aktiviraj site:
```bash
sudo rm /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/radar-puls /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> INICIJALNO: Samo HTTP blok! Komentiši HTTPS server blok dok SSL cert ne bude spreman.

#### Zadatak 2.8 — SSL certifikat sa Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot

# Generiši cert (koristi nginx plugin)
sudo certbot --nginx -d OVDE_DOMEN --non-interactive --agree-tos --email admin@OVDE_DOMEN

# Auto-renewal je već uključen sa certbot apt paketom
sudo systemctl enable certbot.timer
```

> **PREDUSLOV**: DNS mora da pokazuje na server IP pre ovog koraka!
> Za IPv6-only server, dodaj AAAA record: `OVDE_DOMEN → 2a01:4f9:c014:d418::1`
> Ako treba IPv4: kupi Hetzner IPv4 addon (€0.50/mesečno) i dodaj A record.

#### Zadatak 2.9 — Ažuriraj .env sa ispravnim vrednostima

```bash
# U /opt/radar-puls/.env promeniti:
CORS_ORIGIN=https://OVDE_FRONTEND_DOMEN
DOMAIN=OVDE_DOMEN
NOMINATIM_USER_AGENT=radar-puls-api/1.0 (contact: admin@OVDE_DOMEN)
```

#### Zadatak 2.10 — Dodaj DB backup cron

```bash
sudo mkdir -p /opt/backups/radar-puls

sudo tee /opt/radar-puls/scripts/backup-db.sh << 'BACKUP'
#!/bin/bash
set -e
BACKUP_DIR="/opt/backups/radar-puls"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="radar_puls_${TIMESTAMP}.sql.gz"

docker exec radar-puls-db-1 pg_dump -U postgres radar_puls | gzip > "${BACKUP_DIR}/${FILENAME}"

# Obriši backupe starije od 14 dana
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +14 -delete

echo "Backup created: ${FILENAME}"
BACKUP

chmod +x /opt/radar-puls/scripts/backup-db.sh
```

Dodaj u crontab:
```bash
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/radar-puls/scripts/backup-db.sh >> /var/log/radar-puls-backup.log 2>&1") | crontab -
```

#### Zadatak 2.11 — Docker prune cron

```bash
(crontab -l 2>/dev/null; echo "0 4 * * 0 docker image prune -af --filter 'until=168h' >> /var/log/docker-prune.log 2>&1") | crontab -
```

---

### FAZA 3: Monitoring & alerting (opciono, preporučeno)

#### Zadatak 3.1 — Jednostavan healthcheck monitoring

Opcija A — **Uptime Kuma** (self-hosted, besplatno):
```bash
docker run -d \
  --name uptime-kuma \
  --restart unless-stopped \
  -p 3001:3001 \
  -v uptime-kuma-data:/app/data \
  louislam/uptime-kuma:1
```

Zatim podesi monitor za `http://host.docker.internal:3000/health` ili koristi Docker network.

Opcija B — **External service** (healthchecks.io, betteruptime.com):
- Besplatan tier, postavi check za `https://OVDE_DOMEN/health`
- Alerting na email/Telegram ako padne

#### Zadatak 3.2 — Container restart alerting

Dodaj u crontab:
```bash
(crontab -l 2>/dev/null; echo '*/5 * * * * docker ps --filter "status=restarting" --format "{{.Names}}" | while read name; do echo "ALERT: $name is restarting" | logger -t docker-monitor; done') | crontab -
```

---

### FAZA 4: Verifikacija — Checklist nakon svih promena

Ovo je verifikaciona lista. Agent treba da prođe svaku stavku i potvrdi:

```bash
# 1. Svi kontejneri rade
docker compose -f docker-compose.prod.yml ps
# Očekivano: api (healthy), db (healthy), worker (Up), enrichment (Up)

# 2. Migracije su pokrenute
docker exec radar-puls-db-1 psql -U postgres -d radar_puls -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"
# Očekivano: raw_events, parsed_events, map_push_subscriptions, migrations

# 3. Health endpoint
curl -s http://localhost:3000/health
# Očekivano: {"status":"ok","db":"up"}

# 4. SSL radi (nakon DNS + cert)
curl -s https://OVDE_DOMEN/health
# Očekivano: {"status":"ok","db":"up"}

# 5. Port 3000 nije javno dostupan
# Sa spoljnjeg hosta: curl http://SERVER_IP:3000 → timeout

# 6. Swap aktivan
swapon --show
# Očekivano: /swapfile 2G

# 7. SSH hardened
grep PermitRootLogin /etc/ssh/sshd_config
# Očekivano: PermitRootLogin no

# 8. fail2ban aktivan
sudo systemctl is-active fail2ban
# Očekivano: active

# 9. Docker log rotation
docker info --format '{{.LoggingDriver}}'
cat /etc/docker/daemon.json
# Očekivano: json-file sa max-size 10m

# 10. Backup radi
/opt/radar-puls/scripts/backup-db.sh
ls -la /opt/backups/radar-puls/
# Očekivano: .sql.gz fajl

# 11. Worker logovi bez errora
docker logs radar-puls-worker-1 --tail 10
# Očekivano: nema crash, startovao i poliuje

# 12. Enrichment logovi bez errora
docker logs radar-puls-enrichment-1 --tail 10
# Očekivano: nema crash, startovao i poliuje
```

---

## Alati/servisi koje preporučujem

| Alat | Svrha | Cena |
|------|-------|------|
| **Uptime Kuma** | Self-hosted monitoring & alerting | Besplatno |
| **Cloudflare DNS** (proxy off) | DNS management, DDoS zaštita ako se uključi proxy | Besplatno |
| **healthchecks.io** | Cron job monitoring (za backup cron) | Free tier |
| **ntfy.sh** | Push notifikacije na telefon za alertove | Besplatno / self-host |
| **Hetzner IPv4 Addon** | Ako treba IPv4 pristup | €0.50/mesečno |
| **Hetzner Snapshot** | Ceo server backup (disk-level) | €0.012/GB/mesečno |

---

## Sumarni redosled izvršenja

1. **Kod promene** (Faza 1): Edit fajlove → commit → push → CI/CD automatski deploya
2. **Na serveru posle deploy-a** (Faza 2.1–2.5): swap, SSH, fail2ban, docker logs, UFW
3. **Postgres password** (Faza 2.6): Promeni password → restart stack
4. **Nginx + SSL** (Faza 2.7–2.8): Zahteva da domen DNS bude podešen
5. **Env update** (Faza 2.9): CORS, DOMAIN
6. **Backup + prune** (Faza 2.10–2.11)
7. **Monitoring** (Faza 3): Opciono ali preporučeno
8. **Verifikacija** (Faza 4): Potvrdi da sve radi

---

## Napomene

- **IPv6-only server**: Hetzner CX22 nema IPv4. Neki klijenti (stari Android, neke mreže) ne podržavaju IPv6. Razmotri kupovinu IPv4 addon-a (€0.50/mesečno) ako je public API.
- **`docker-compose.edge.yml`**: NE KORISTITI u produkciji. Host Nginx je bolji izbor za ovaj setup (manje kontejnera, lakši certbot). Fajl može ostati u repo-u za referencu.
- **GitHub Secrets potrebni**: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`, `GHCR_USERNAME`, `GHCR_TOKEN` — proveri da su svi setovani u GitHub repo Settings → Secrets.
- **DEVICE_TOKENS_JSON u .env**: Trenutno sadrži dev token. Za produkciju, setovati prave tokene sa Android listener uredjaja.
