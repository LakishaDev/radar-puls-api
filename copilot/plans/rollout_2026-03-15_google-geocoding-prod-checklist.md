# Production Rollout Checklist: Google Geocoding Migration

Date: 2026-03-15
Owner: API/Infra
Scope: Migracija sa Nominatim na Google Geocoding + geocoding_cache tabela

## 1. Pre-deploy priprema

- [ ] Potvrdi da su kod izmene mergovane na deploy branch.
- [ ] Potvrdi da je migracija za `geocoding_cache` prisutna u `src/database/migrations/`.
- [ ] Potvrdi da su env validacije azurirane (`GOOGLE_GEOCODING_API_KEY`, `GOOGLE_GEOCODING_DELAY_MS`).
- [ ] Potvrdi da je uklonjena zavisnost od `NOMINATIM_USER_AGENT`.
- [ ] Potvrdi da su geocoding testovi prosli lokalno/CI.

## 2. Google API key bezbednost

- [ ] Kreiraj produkcioni Google API key (ako ne postoji).
- [ ] U Google Cloud Console ograniciti key na:
  - [ ] Samo Geocoding API.
  - [ ] Server IP adrese (production host).
- [ ] Ukljuci budget alert (npr. 50%, 80%, 100% mesecnog budzeta).
- [ ] Potvrdi da se API key nigde ne loguje.

## 3. Production env update

- [ ] Dodaj/azuriraj varijable u production `.env`:
  - [ ] `GOOGLE_GEOCODING_API_KEY=<secret>`
  - [ ] `GOOGLE_GEOCODING_DELAY_MS=0`
  - [ ] `GEO_ENABLED=true`
- [ ] Proveri da nema stare `NOMINATIM_USER_AGENT` varijable.
- [ ] Proveri da worker/enrichment koriste isti env set (ako dele image/env source).

## 4. DB safety pre migracije

- [ ] Proveri konekciju na production bazu.
- [ ] Napravi backup baze pre deploy-a (snapshot ili pg_dump).
- [ ] Potvrdi da postoji dovoljno slobodnog prostora na disku.

Primer backup komande:

```bash
pg_dump "$DATABASE_URL" -Fc -f backup_pre_google_geocoding_$(date +%F_%H%M).dump
```

## 5. Deploy + migration rollout

- [ ] Pull poslednji image/release.
- [ ] Pokreni API kontejnere sa novim env-om.
- [ ] Pokreni migracije.
- [ ] Potvrdi da je migracija uspesno zavrsena bez rollback-a.

Primer:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker compose -f docker-compose.prod.yml exec -T api npm run migration:run:prod
```

## 6. Post-migration verifikacija

- [ ] Potvrdi da tabela `geocoding_cache` postoji.
- [ ] Potvrdi da indeksi postoje (`normalized_text`, `verified=true` partial index).
- [ ] Potvrdi da API startuje bez env validation gresaka.
- [ ] Proveri health endpoint.
- [ ] Posalji 1-2 test event-a sa lokacijom koja nije u fallback-u.
- [ ] Potvrdi da se red upisuje u `geocoding_cache`.
- [ ] Potvrdi da `geo_source` vraca `google` ili `google_partial` za nove geokodirane evente.

Primer SQL provera:

```sql
SELECT COUNT(*) FROM geocoding_cache;
SELECT normalized_text, verified, is_partial, location_type, hit_count
FROM geocoding_cache
ORDER BY updated_at DESC
LIMIT 20;
```

## 7. Promote verified smoke check

- [ ] Proveri da `promoteVerifiedLocations` radi bez greske u enrichment ciklusu.
- [ ] Potvrdi da lokacije sa net score >= 5 prelaze u `verified = true`.
- [ ] Potvrdi da verified lokacije kasnije vracaju source `cache`.

## 8. Monitoring prvih 24h

- [ ] Pratiti logove za `REQUEST_DENIED`, `OVER_QUERY_LIMIT`, `UNKNOWN_ERROR`.
- [ ] Pratiti rast `geocoding_cache` i odnos partial/non-partial pogodaka.
- [ ] Pratiti latency geocoding-a i eventualne timeout-ove.
- [ ] Pratiti Google trosak i dnevni broj request-a.

## 9. Rollback plan

Ako dodje do problema (npr. key denied, quota issue, neocekivani geocoding quality pad):

- [ ] Hitno postavi `GEO_ENABLED=false` i restartuj servise (fallback-only mod).
- [ ] Po potrebi vrati prethodni image/release.
- [ ] Migraciju za `geocoding_cache` nije neophodno rollback-ovati odmah (bezbedno je ostaviti tabelu).
- [ ] Otvori incident/task sa logovima i timestamp-ovima gresaka.

## 10. Sign-off

- [ ] API owner sign-off
- [ ] Ops sign-off
- [ ] Monitoring sign-off (nema kriticnih gresaka 24h)
- [ ] Obelezi rollout kao zavrsen u tracking dokumentu
