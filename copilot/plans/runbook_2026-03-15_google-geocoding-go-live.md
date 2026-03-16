# Go-Live Runbook: Google Geocoding Migration

Date: 2026-03-15
Scope: Production rollout za Google geocoding + geocoding_cache
Expected window: 15-30 min

## 0. Pre-flight (lokalno)

1. Proveri da su testovi prosli:

   npm test -- test/geocoding.e2e-spec.ts

2. Proveri da migracija postoji:

   ls -1 src/database/migrations | grep -i geocoding

3. Proveri da postoji runbook/checklist dokumentacija:

   ls -1 copilot/plans | grep -E "rollout|runbook"

## 1. SSH i pozicioniranje na serveru

1. Uloguj se:

   ssh deploy@api.radarpuls.com

2. Idi u projekat:

   cd /opt/radar-puls

3. Proveri da je env spreman (bez printovanja tajni):

   grep -E "^(GOOGLE_GEOCODING_API_KEY|GOOGLE_GEOCODING_DELAY_MS|GEO_ENABLED)=" .env | sed -E "s/(GOOGLE_GEOCODING_API_KEY=).+/\1***REDACTED***/"

4. Proveri da nema legacy varijable:

   grep -n "NOMINATIM_USER_AGENT" .env || true

## 2. Safety backup baze

1. Napravi backup pre migracije:

   mkdir -p /opt/radar-puls/backups
   docker compose -f docker-compose.prod.yml exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /opt/radar-puls/backups/pre_google_geocoding_$(date +%F_%H%M).dump

2. Proveri da backup fajl postoji:

   ls -lh /opt/radar-puls/backups | tail -n 3

## 3. Deploy i migracija

1. Pull latest image:

   docker compose -f docker-compose.prod.yml pull

2. Start/refresh servise:

   docker compose -f docker-compose.prod.yml up -d --remove-orphans

3. Pokreni migracije:

   docker compose -f docker-compose.prod.yml exec -T api npm run migration:run:prod

4. Proveri status kontejnera:

   docker compose -f docker-compose.prod.yml ps

## 4. Post-deploy verifikacija

1. Proveri health endpoint:

   curl -fsS http://localhost:3000/api/health && echo "\nhealth ok"

2. Proveri da tabela postoji:

   docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt geocoding_cache"

3. Proveri indexe:

   docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\di+ idx_geocoding_cache_*"

4. Proveri da API ne prijavljuje env validation greske:

   docker compose -f docker-compose.prod.yml logs --since=10m api | grep -Ei "validation|GOOGLE_GEOCODING|NOMINATIM|error" || true

## 5. Functional smoke (geocoding + cache)

1. Posalji test event koji nije u lokalnom fallback-u:

   curl -s -X POST "https://api.radarpuls.com/api/events/viber" -H "Authorization: Bearer dev-token-01" -H "Content-Type: application/json" -d '{"source":"viber","group":"radar-test","message":"Na pevcu pravac ka delti zaustavljaju","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","device_id":"android_listener_01"}'

2. Proveri da ima redova u geocoding_cache:

   docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT normalized_text, verified, is_partial, location_type, hit_count, updated_at FROM geocoding_cache ORDER BY updated_at DESC LIMIT 10;"

3. Proveri geo_source u parsed_events:

   docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT geo_source, location_text, upvotes, downvotes, created_at FROM parsed_events ORDER BY created_at DESC LIMIT 10;"

## 6. Promote verified smoke

1. Rucno proveri da li postoje kandidati sa net >= 5:

   docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT location_text, (upvotes - downvotes) AS net_score FROM parsed_events WHERE location_text IS NOT NULL ORDER BY net_score DESC LIMIT 20;"

2. Ako enrichment radi periodicki, proveri logove za promotion:

   docker compose -f docker-compose.prod.yml logs --since=15m enrichment | grep -Ei "geocoding_cache_promoted|geocoding_cache_promotion_failed" || true

3. Potvrdi verified transition:

   docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT normalized_text, verified, hit_count, updated_at FROM geocoding_cache ORDER BY updated_at DESC LIMIT 20;"

## 7. Monitoring prvih 24h

1. Prati API/enrichment logove:

   docker compose -f docker-compose.prod.yml logs -f api enrichment

2. Posebno gledaj statuse:

   REQUEST_DENIED
   OVER_QUERY_LIMIT
   UNKNOWN_ERROR

3. Jednom dnevno proveri rast cache-a:

   docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) AS cache_rows, SUM(CASE WHEN is_partial THEN 1 ELSE 0 END) AS partial_rows FROM geocoding_cache;"

## 8. Rollback (ako nesto krene lose)

1. Brzi fallback-only mod:

   sed -i 's/^GEO_ENABLED=.*/GEO_ENABLED=false/' .env
   docker compose -f docker-compose.prod.yml up -d --remove-orphans

2. Vrati prethodni image tag (ako ga koristis):

   export APP_IMAGE=ghcr.io/<owner>/<repo>:<previous-tag>
   docker compose -f docker-compose.prod.yml up -d --remove-orphans

3. Potvrdi health:

   curl -fsS http://localhost:3000/api/health && echo "\nhealth ok after rollback"

4. Migraciju nije potrebno odmah rollback-ovati; geocoding_cache tabela moze bezbedno ostati.

## 9. Exit criteria

- API health je stabilan.
- geocoding_cache se puni bez gresaka.
- Nema REQUEST_DENIED / kriticnih Google gresaka.
- Nema regresije ingestion/enrichment toka.
- Ops i API owner potvrde zavrsetak rollout-a.
