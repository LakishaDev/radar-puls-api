# Radar Puls API - Environment promenljive

Ovaj dokument opisuje sve environment promenljive koje koristi API, radnici i edge (nginx) servis. Primeri su bez stvarnih tajni; zameni placeholder vrednosti na produkciji. Bool vrednosti navodi kao string `"true"` / `"false"` jer ih tako cita `ConfigService`.

## Core & Deploy
| Varijabla | Svrha | Obavezno | Podrazumevano / primer | Gde se koristi | Tip / format |
|-----------|-------|----------|------------------------|----------------|--------------|
| PORT | TCP port na kome API slusa. | Da | `3000` | Nest main bootstrap | integer > 0 |
| NODE_ENV | Okruzenje (`development` / `production`). Utice na guardove i log nivoe. | Da | `production` (prod), `development` (local) | globalno | string |
| APP_DOMAIN | Hostname za edge nginx i TLS cert. | Da za edge | `radarpuls.com` | `deploy/nginx` template, `docker-compose.edge.yml` | FQDN |
| APP_IMAGE | Tag Docker slike za api/worker/enrichment. | Da za deploy | `ghcr.io/owner/repo:latest` | `docker-compose.prod.yml` | image ref |
| DOMAIN | Domen za certbot (treba da se poklapa sa APP_DOMAIN). | Da za edge | `radarpuls.com` | `docker-compose.edge.yml` certbot | FQDN |
| LETSENCRYPT_EMAIL | Kontakt email za Let's Encrypt. | Da za edge | `admin@radarpuls.com` | certbot container | email |

## Baza
| Varijabla | Svrha | Obavezno | Podrazumevano / primer | Gde se koristi | Tip / format |
|-----------|-------|----------|------------------------|----------------|--------------|
| DATABASE_URL | Postgres konekcioni string. | Da | `postgres://postgres:change-this-db-password@db:5432/radar_puls` | TypeORM data source | URL |
| POSTGRES_DB | Ime baze za Postgres servis (compose). | Da za self-hosted | `radar_puls` | `docker-compose.prod.yml` (db svc) | string |
| POSTGRES_USER | DB user za Postgres servis. | Da za self-hosted | `postgres` | `docker-compose.prod.yml` | string |
| POSTGRES_PASSWORD | Lozinka za Postgres servis. | Da za self-hosted | `change-this-db-password` | `docker-compose.prod.yml` | string |

## Autentikacija uredjaja
| Varijabla | Svrha | Obavezno | Podrazumevano / primer | Gde se koristi | Tip / format |
|-----------|-------|----------|------------------------|----------------|--------------|
| DEVICE_TOKENS_JSON | JSON mapa `device_id -> bearer token` za Android listener klijente. | Da | `{ "android_listener_01": "token" }` | `auth/device-token.service.ts` | JSON objekat |

## OpenAI & Parser
| Varijabla | Svrha | Obavezno | Podrazumevano / primer | Gde se koristi | Tip / format |
|-----------|-------|----------|------------------------|----------------|--------------|
| OPENAI_API_KEY | API kljuc za OpenAI pozive u enrichmentu. | Da | `<set-on-server>` | `enrichment.service.ts` | string |
| OPENAI_MODEL | Model za enrichment ekstrakciju. | Ne (ima default) | `gpt-5-mini` | `enrichment.service.ts` | string |
| PARSER_VERSION | Verzija parsera koja se upisuje u `parsed_events`. | Ne | `v1.0` | `parsing.service.ts` | string |

## Geokodiranje
| Varijabla | Svrha | Obavezno | Podrazumevano / primer | Gde se koristi | Tip / format |
|-----------|-------|----------|------------------------|----------------|--------------|
| GOOGLE_GEOCODING_API_KEY | API kljuc za Google Geocoding. | Da | `<set-on-server>` | `geocoding.service.ts` | string |
| GOOGLE_GEOCODING_DELAY_MS | Artificial delay izmedju geocoding poziva. | Ne | `0` | `geocoding.service.ts` | integer ms |
| GEO_ENABLED | Omogucava/iskljucuje geocoding (fallback radi i kad je false). | Ne | `true` | `geocoding.service.ts` | `"true"`/`"false"` |
| GEO_AUTO_VERIFY_ENABLED | Auto-verifikacija lokacija kad je confidence visok. | Ne | `false` | `enrichment.service.ts` | `"true"`/`"false"` |
| GEO_AUTO_VERIFY_MIN_CONFIDENCE | Prag za auto-verifikaciju. | Ne | `90` | `enrichment.service.ts` | integer 50-100 |

## Worker & Backfill
| Varijabla | Svrha | Obavezno | Podrazumevano / primer | Gde se koristi | Tip / format |
|-----------|-------|----------|------------------------|----------------|--------------|
| WORKER_BATCH_SIZE | Koliko zapisa worker claimuje po ciklusu. | Ne | `100` | `processing.service.ts` | integer > 0 |
| WORKER_POLL_INTERVAL_MS | Interval izmedju ciklusa workera. | Ne | `5000` | `processing.service.ts` | integer ms |
| WORKER_LEASE_TIMEOUT_MS | Vreme nakon kog se lease oslobadja. | Ne | `300000` | `processing.service.ts` | integer ms |
| WORKER_MAX_RETRIES | Maksimalan broj ponavljanja pre `failed`. | Ne | `3` | `processing.service.ts` | integer |
| WORKER_INSTANCE_ID | Labela za logove/claim (korisno kad ima vise worker-a). | Ne | `worker-1` | `processing.service.ts` | string |
| ENABLE_DEV_PROCESSING_TRIGGER | Dozvoljava dev-only endpoint za jedan batch. | Ne | `false` prod (`true` dev) | `processing-dev.guard.ts` | `"true"`/`"false"` |
| PROCESSING_DEV_TRIGGER_TOKEN | Token za dev trigger endpoint. | Kad ENABLE_DEV_PROCESSING_TRIGGER=true | `<random>` | `processing-dev.guard.ts` | string |
| ENABLE_BACKFILL | Ukljucuje backfill servis/endpoint. | Ne | `false` | `backfill.guard.ts`, `backfill.service.ts` | `"true"`/`"false"` |
| BACKFILL_TRIGGER_TOKEN | Token za backfill endpoint. | Kad ENABLE_BACKFILL=true | `<random>` | `backfill.guard.ts` | string |
| ENRICHMENT_POLL_INTERVAL_MS | Interval izmedju ciklusa enrichment-a. | Ne | `10000` | `enrichment.service.ts` | integer ms |
| ENRICHMENT_BATCH_SIZE | Broj zapisa po ciklusu u enrichment-u. | Ne | `10` | `enrichment.service.ts` | integer > 0 |
| ENRICHMENT_MAX_ATTEMPTS | Maks broj enrichment pokusaja pre trajnog failure-a. | Ne | `3` | `enrichment.service.ts` | integer |
| ENRICHMENT_RETRY_COOLDOWN_MS | Bazni delay za exponential backoff. | Ne | `60000` | `enrichment.service.ts` | integer ms (>=1000) |

## Bezbednost / javni API
| Varijabla | Svrha | Obavezno | Podrazumevano / primer | Gde se koristi | Tip / format |
|-----------|-------|----------|------------------------|----------------|--------------|
| CORS_ORIGIN | Dozvoljeni web origin-i, comma-separated. | Ne | `https://radarpuls.com,https://api.radarpuls.com` (prod) | `main.ts` CORS | lista stringova |
| ADMIN_API_TOKEN | Stalan bearer token za admin rute. | Da | `<long-random>` | `admin-auth.guard.ts` | string |
| RECAPTCHA_SECRET_KEY | reCAPTCHA secret za javne prijave. | Ne (ako nije ukljucen captcha) | `<secret>` | `public-captcha.service.ts` | string |
| VAPID_PUBLIC_KEY | Web Push VAPID public key. | Ne (za Web Push) | `<base64>` | `push-notifications.service.ts` | string |
| VAPID_PRIVATE_KEY | Web Push VAPID private key. | Ne (za Web Push) | `<base64>` | `push-notifications.service.ts` | string |
| VAPID_SUBJECT | Kontakt (npr. `mailto:alerts@...`) za Web Push. | Ne (za Web Push) | `mailto:alerts@radarpuls.com` | `push-notifications.service.ts` | string |
| FCM_PROJECT_ID | Firebase project ID za mobilne push notifikacije. | Da za FCM | `radar-puls-7e634` (primer) | `mobile-push.service.ts` | string |
| FCM_CLIENT_EMAIL | Service account client email za FCM. | Da za FCM | `firebase-adminsdk-xxx@project.iam.gserviceaccount.com` | `mobile-push.service.ts` | string |
| FCM_PRIVATE_KEY | Service account private key (escape-ovan sa `\n`). | Da za FCM | `-----BEGIN PRIVATE KEY-----\n...` | `mobile-push.service.ts` | string |

## App config / klijenti
| Varijabla | Svrha | Obavezno | Podrazumevano / primer | Gde se koristi | Tip / format |
|-----------|-------|----------|------------------------|----------------|--------------|
| APP_MIN_VERSION | Minimalna verzija aplikacije (blokira starije). | Da | `1.0.0` | `app-config.service.ts` | semver string |
| APP_LATEST_VERSION | Preporucena najnovija verzija. | Da | `1.0.0` | `app-config.service.ts` | semver string |
| APP_MAINTENANCE_MODE | Da li je app u odrzavanju (globalni flag). | Ne | `false` | `app-config.service.ts` | `"true"`/`"false"` |
| APP_MAINTENANCE_MESSAGE | Poruka za ekran odrzavanja. | Ne | `` (prazno) | `app-config.service.ts` | string |
| APP_FORCE_UPDATE_MESSAGE | Poruka za force update ekran. | Ne | `Potrebno je azuriranje aplikacije za nastavak koriscenja.` | `app-config.service.ts` | string |
| APP_PLAY_STORE_URL | Link ka Android app. | Da | `https://play.google.com/store/apps/details?id=com.radarpuls.app` | `app-config.service.ts` | URL |
| APP_APPLE_STORE_URL | Link ka iOS app. | Da | `https://apps.apple.com/app/radar-puls/id123456789` | `app-config.service.ts` | URL |
| APP_ANNOUNCEMENT_TEXT | Tekst bannera/obavestenja. Prazno = nema bannera. | Ne | `` (prazno) | `app-config.service.ts` | string |
| APP_ANNOUNCEMENT_TYPE | Tip bannera (`info`/`warning`/`success`). | Ne | `info` | `app-config.service.ts` | enum |
| APP_ANNOUNCEMENT_URL | Link na koji vodi banner. | Ne | `` (prazno) | `app-config.service.ts` | URL |
| APP_ANNOUNCEMENT_ID | ID bannera (za klijentski cache/dismiss). | Ne | `default` | `app-config.service.ts` | string |
| APP_ANNOUNCEMENT_DISMISSIBLE | Da li korisnik moze da zatvori banner. | Ne | `true` | `app-config.service.ts` | `"true"`/`"false"` |

## Deep link verifikacija
| Varijabla | Svrha | Obavezno | Podrazumevano / primer | Gde se koristi | Tip / format |
|-----------|-------|----------|------------------------|----------------|--------------|
| ANDROID_SHA256_FINGERPRINT | SHA-256 fingerprint release keystore-a za assetlinks. | Da za Android App Links | `AA:BB:CC:...` | `well-known.controller.ts` (`/.well-known/assetlinks.json`) | fingerprint string |
| APPLE_TEAM_ID | Apple Team ID za univerzalne linkove. | Da za iOS universal links | `A1B2C3D4E5` | `well-known.controller.ts` (`/.well-known/apple-app-site-association`) | string |

## Napomene
- Ne unositi stvarne kljuceve u repo; drzi produkcione vrednosti samo na serveru (`/opt/radar-puls/.env`).
- Za FCM_PRIVATE_KEY koristi jedan red sa `\n` escape da bi se pravilno parsirao iz env-a.
- Ako menjas APP_IMAGE, obavezno `docker compose pull` pre podizanja stack-a.
- Bool vrednosti se prosledjuju kao stringovi (`"true"`/`"false"`).
