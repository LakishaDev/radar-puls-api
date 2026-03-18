# Radar Puls — Firebase dodatne funkcionalnosti (API Backend)

> **Datum:** 2026-03-18  
> **Referenca:** `plans/2026-03-18-firebase-dodatne-funkcionalnosti-apk.md`  
> **Scope:** Samo NestJS API backend izmene potrebne da podrže nove Firebase feature-e  
> **Status:** Odobren za implementaciju  
> **Tech stack:** NestJS, TypeScript, Firebase Admin SDK

---

## Sadržaj

1. [FCM Push Payload — data za deep linking](#1-fcm-push-payload)
2. [Deep Link verifikacioni fajlovi (assetlinks + apple-app-site-association)](#2-deep-link-verifikacioni-fajlovi)
3. [API endpoint za pojedinačan report (GET /api/map/reports/:id)](#3-api-endpoint-za-pojedinačan-report)
4. [BONUS: API endpoint za app verziju (alternativa Remote Config-u)](#4-bonus-api-endpoint-za-app-verziju)
5. [Firebase Admin SDK konfiguracija (provera)](#5-firebase-admin-sdk-konfiguracija)
6. [Faze implementacije](#6-faze-implementacije)

---

## Preduslov

Backend već treba da ima FCM push implementaciju iz `plans/2026-03-18-otvorena-pitanja-resenja.md` sekcija 1 (Opcija A — FCM na API). Ovo uključuje:
- `mobile_push_tokens` tabelu
- `/api/map/mobile/register-device` endpoint
- `MobilePushService` sa Firebase Admin SDK
- Slanje push notifikacija pri novom report-u

Ako to još nije implementirano, **PRVO** završiti te korake pre ovog plana.

---

## 1. FCM Push Payload — data za deep linking

### 1.1 Problem

Trenutno (ako je FCM implementiran), push poruka verovatno šalje samo `notification` objekat (naslov + tekst). Za deep linking, APK treba i `data` objekat sa ID-jem report-a i koordinatama.

### 1.2 Šta treba promeniti

U servisu koji šalje FCM push (verovatno `MobilePushService` ili slično), payload mora sadržati `data` polje sa sledećim ključevima:

### 1.3 Tačan format FCM payload-a

```typescript
// U MobilePushService (ili gde se šalje FCM)
// OVO je format koji APK očekuje — ni jedan ključ ne sme nedostajati

import * as admin from 'firebase-admin';

interface SendPushParams {
  fcmTokens: string[];          // FCM tokeni uređaja kojima šaljemo
  report: MapReportEntity;       // Report entitet iz baze
}

async sendNewReportNotification({ fcmTokens, report }: SendPushParams): Promise<void> {
  if (fcmTokens.length === 0) return;

  const message: admin.messaging.MulticastMessage = {
    tokens: fcmTokens,

    // ═══ NOTIFICATION (prikazuje se u system notification tray) ═══
    notification: {
      title: `${this.getEmoji(report.eventType)} Nova prijava u blizini!`,
      body: `${this.getEventTypeLabel(report.eventType)} — ${report.locationText || 'Nepoznata lokacija'}`,
    },

    // ═══ DATA (APK čita ove vrednosti za deep linking) ═══
    // SVI KLJUČEVI MORAJU BITI STRINGOVI — Firebase ne prihvata brojeve u data
    data: {
      type: 'new_report',                           // OBAVEZNO — APK proverava ovo
      reportId: report.id,                           // OBAVEZNO — UUID report-a
      eventType: report.eventType,                   // OBAVEZNO — 'police', 'radar', itd.
      lat: String(report.lat),                       // OBAVEZNO — latitude kao string
      lng: String(report.lng),                       // OBAVEZNO — longitude kao string
      locationText: report.locationText || '',        // OPCIONO — adresa
      clickAction: 'OPEN_REPORT',                    // OBAVEZNO — APK proverava ovo
    },

    // ═══ ANDROID SPECIFIČNO ═══
    android: {
      priority: 'high',                              // Highpriority za brzu dostavu
      notification: {
        channelId: 'radar_puls_alerts',              // Mora odgovarati kanalu u APK-u
        sound: 'alert_default',                      // Custom sound
        clickAction: 'OPEN_REPORT',
      },
    },

    // ═══ iOS SPECIFIČNO ═══
    apns: {
      payload: {
        aps: {
          sound: 'alert_default.mp3',
          badge: 1,
          'content-available': 1,                    // Dozvoli background processing
        },
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    // Loguj neuspele tokene (expired, invalid)
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(fcmTokens[idx]);
          // Ako je token invalid/expired, obrisati iz baze
          if (
            resp.error?.code === 'messaging/registration-token-not-registered' ||
            resp.error?.code === 'messaging/invalid-registration-token'
          ) {
            this.removeInvalidToken(fcmTokens[idx]);
          }
        }
      });
      this.logger.warn(`FCM: ${response.failureCount} failed tokens`, failedTokens);
    }
  } catch (error) {
    this.logger.error('FCM send error', error);
  }
}

// ═══ HELPER METODE ═══

private getEmoji(eventType: string): string {
  const emojiMap: Record<string, string> = {
    police: '🚔',
    radar: '📷',
    checkpoint: '🚧',
    accident: '💥',
    traffic_jam: '🚗',
    unknown: '❓',
  };
  return emojiMap[eventType] || '📍';
}

private getEventTypeLabel(eventType: string): string {
  const labelMap: Record<string, string> = {
    police: 'Policija',
    radar: 'Radar',
    checkpoint: 'Kontrola',
    accident: 'Nesreća',
    traffic_jam: 'Gužva',
    unknown: 'Nepoznato',
  };
  return labelMap[eventType] || 'Prijava';
}

private async removeInvalidToken(token: string): Promise<void> {
  // Obriši token iz mobile_push_tokens tabele
  await this.pushTokenRepository.delete({ fcmToken: token });
}
```

### 1.4 Bitne napomene za implementatora

1. **SVI ključevi u `data` moraju biti stringovi.** Firebase Admin SDK ne prihvata `number` ili `boolean` u `data` polju. Zato je `lat: String(report.lat)` a ne `lat: report.lat`.

2. **`clickAction: 'OPEN_REPORT'`** — APK ovo ne koristi direktno, ali Android sistem koristi za routing.

3. **`channelId: 'radar_puls_alerts'`** — MORA odgovarati notification channel ID-u definisanom u APK-u. Kanal se zove `radar_puls_alerts`.

4. **`sendEachForMulticast`** umesto starog `sendMulticast` — Firebase Admin SDK v12+ deprecira `sendMulticast`.

5. **Token cleanup** — kad Firebase vrati `registration-token-not-registered`, token treba obrisati iz baze. Korisnik je deinstalirao app ili se token promenio.

### 1.5 Kada se šalje push

Push se šalje kad se kreira novi report, ali SAMO korisnicima čija zona (zoneLat, zoneLng, radiusMeters iz `mobile_push_tokens` tabele) pokriva lokaciju novog report-a.

```typescript
// Pseudokod — naći tokene u radijusu
async getTokensInRadius(lat: number, lng: number): Promise<string[]> {
  // SQL upit koji koristi Haversine formulu da nađe sve uređaje
  // čija zona pokriva novo prijavljenu lokaciju
  const tokens = await this.pushTokenRepository
    .createQueryBuilder('t')
    .where(
      `(6371000 * acos(
        cos(radians(:lat)) * cos(radians(t.zone_lat)) *
        cos(radians(t.zone_lng) - radians(:lng)) +
        sin(radians(:lat)) * sin(radians(t.zone_lat))
      )) <= t.radius_meters`,
      { lat, lng },
    )
    .select('t.fcm_token')
    .getMany();

  return tokens.map(t => t.fcmToken);
}
```

---

## 2. Deep Link verifikacioni fajlovi

### 2.1 Zašto je ovo potrebno

Da bi Android/iOS automatski otvarali app umesto browser-a kad korisnik klikne na URL `https://radarpuls.com/report/abc123`, operativni sistem proverava da li domena zaista pripada app-u. To radi putem verifikacionih fajlova na serveru.

### 2.2 Android — assetlinks.json

Ovaj fajl MORA biti dostupan na `https://radarpuls.com/.well-known/assetlinks.json` (tačan URL, bez redirecta, HTTPS obavezno, Content-Type `application/json`).

**Fajl sadržaj:**

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.radarpuls.app",
      "sha256_cert_fingerprints": [
        "OVDE_IDE_SHA256_FINGERPRINT_TVOG_SIGNING_KLJUCA"
      ]
    }
  }
]
```

### 2.3 Kako dobiti SHA256 fingerprint

```bash
# Za debug keystore:
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA256

# Za release keystore:
keytool -list -v -keystore android/app/keystore/release.keystore -alias radarpuls | grep SHA256
```

Output izgleda ovako: `SHA256: 14:6D:E9:...`

Zameni `:` sa `` i ubaci u `sha256_cert_fingerprints`. Na primer:  
`"14:6D:E9:83:C5:..."` → `"14:6D:E9:83:C5:..."`

**NAPOMENA:** Za produkciju koristiti SHA256 od **release** keystore-a. Za debug, dodati i debug fingerprint (može biti niz sa 2 elementa).

### 2.4 iOS — apple-app-site-association

Ovaj fajl MORA biti dostupan na `https://radarpuls.com/.well-known/apple-app-site-association` (tačan URL, bez redirecta, HTTPS obavezno, Content-Type `application/json`, BEZ `.json` ekstenzije u URL-u).

**Fajl sadržaj:**

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.radarpuls.app",
        "paths": [
          "/report/*"
        ]
      }
    ]
  }
}
```

`TEAM_ID` je Apple Developer Team ID (10-cifreni alfanumerički kod, npr. `A1B2C3D4E5`). Nalazi se u Apple Developer Console → Membership.

### 2.5 Implementacija na NestJS API

Postoje dva načina da se ovi fajlovi serviraju:

**Opcija A: Statički fajlovi (preporučeno — najjednostavnije)**

Ako NestJS API servira i frontend ili ako postoji Nginx/Caddy ispred:

```
# Za Nginx — dodati u server blok za radarpuls.com
location /.well-known/assetlinks.json {
    default_type application/json;
    alias /var/www/radarpuls/.well-known/assetlinks.json;
}

location /.well-known/apple-app-site-association {
    default_type application/json;
    alias /var/www/radarpuls/.well-known/apple-app-site-association;
}
```

**Opcija B: NestJS controller (ako API direktno servira domen)**

```typescript
// src/well-known/well-known.controller.ts

import { Controller, Get, Header } from '@nestjs/common';

@Controller('.well-known')
export class WellKnownController {

  @Get('assetlinks.json')
  @Header('Content-Type', 'application/json')
  getAssetLinks() {
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.radarpuls.app',
          sha256_cert_fingerprints: [
            process.env.ANDROID_SHA256_FINGERPRINT || 'TODO_REPLACE',
          ],
        },
      },
    ];
  }

  @Get('apple-app-site-association')
  @Header('Content-Type', 'application/json')
  getAppleAppSiteAssociation() {
    return {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${process.env.APPLE_TEAM_ID || 'TEAM_ID'}.com.radarpuls.app`,
            paths: ['/report/*'],
          },
        ],
      },
    };
  }
}
```

**Registrovati modul:**

```typescript
// src/well-known/well-known.module.ts

import { Module } from '@nestjs/common';
import { WellKnownController } from './well-known.controller';

@Module({
  controllers: [WellKnownController],
})
export class WellKnownModule {}
```

**Dodati u `app.module.ts`:**

```typescript
@Module({
  imports: [
    // ... postojeći moduli ...
    WellKnownModule,  // ← DODATI
  ],
})
export class AppModule {}
```

### 2.6 ENV varijable za dodati

```bash
# .env — dodati:
ANDROID_SHA256_FINGERPRINT=14:6D:E9:...
APPLE_TEAM_ID=A1B2C3D4E5
```

### 2.7 Verifikacija da radi

```bash
# Android verifikacija:
curl -s https://radarpuls.com/.well-known/assetlinks.json | jq .

# iOS verifikacija:
curl -s https://radarpuls.com/.well-known/apple-app-site-association | jq .

# Oba moraju vratiti JSON, Content-Type: application/json, HTTPS, bez redirecta
```

Apple ima i online validator: `https://search.developer.apple.com/appsearch-validation-tool/` — unesi `radarpuls.com` i proveri.

---

## 3. API endpoint za pojedinačan report

### 3.1 Zašto je ovo potrebno

Kad korisnik tapne na push notifikaciju ili otvori deep link, APK prima `reportId`. Treba mu endpoint da dohvati podatke o tom jednom report-u (za slučaj da report još nije u kešu, ili ako je app tek otvoren).

### 3.2 Provera: Da li endpoint već postoji?

Proveriti u API kodu da li postoji `GET /api/map/reports/:id`. Ako postoji i vraća iste podatke kao report u listi, ovaj korak se **PRESKAČE**.

Ako ne postoji, kreirati:

### 3.3 Implementacija

**Fajl: `src/map/map.controller.ts`** — dodati novu rutu:

```typescript
@Get('reports/:id')
@UseGuards(PublicMapRateLimitGuard)
async getReportById(
  @Param('id') id: string,
): Promise<MapReportDto | null> {
  // Validacija: id mora biti validan UUID format
  if (!this.isValidUuid(id)) {
    throw new BadRequestException('Invalid report ID format');
  }

  const report = await this.eventsService.getReportById(id);

  if (!report) {
    throw new NotFoundException('Report not found');
  }

  return this.mapToDto(report);
}

private isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
```

**Fajl: `src/map/events.service.ts`** — dodati metodu:

```typescript
async getReportById(id: string): Promise<MapReportEntity | null> {
  return this.reportRepository.findOne({
    where: { id },
  });
}
```

### 3.4 Response format

Identičan formatu report-a u listi (`GET /api/map/reports`). APK koristi isti `MapReport.fromJson()` model.

```json
{
  "id": "abc123-...",
  "eventType": "police",
  "lat": 43.3209,
  "lng": 21.8958,
  "locationText": "Bulevar Nemanjića",
  "description": "Patrola na raskrsnici",
  "rawMessage": "...",
  "eventTime": "2026-03-18T14:30:00Z",
  "upvotes": 5,
  "downvotes": 1,
  "confidence": 0.95,
  "geoSource": "user_gps",
  "moderationStatus": "approved"
}
```

---

## 4. BONUS: API endpoint za app verziju (alternativa Remote Config-u)

### 4.1 Zašto

Ako ne želiš da se osloniš isključivo na Firebase Remote Config za force update (npr. Firebase može pasti), možeš dodati backup endpoint na API koji vraća minimalnu verziju.

**Ovo je OPCIONALNO. APK primarno koristi Remote Config. Ovaj endpoint je fallback.**

### 4.2 Implementacija

**Fajl: `src/app-config/app-config.controller.ts`** — novi controller:

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('api/app-config')
export class AppConfigController {

  @Get('version')
  getVersionInfo() {
    return {
      minVersion: process.env.APP_MIN_VERSION || '1.0.0',
      latestVersion: process.env.APP_LATEST_VERSION || '1.0.0',
      maintenanceMode: process.env.APP_MAINTENANCE_MODE === 'true',
      maintenanceMessage: process.env.APP_MAINTENANCE_MESSAGE || '',
    };
  }
}
```

**ENV varijable:**

```bash
APP_MIN_VERSION=1.0.0
APP_LATEST_VERSION=1.0.0
APP_MAINTENANCE_MODE=false
APP_MAINTENANCE_MESSAGE=
```

**Registracija modula:**

```typescript
// src/app-config/app-config.module.ts
import { Module } from '@nestjs/common';
import { AppConfigController } from './app-config.controller';

@Module({
  controllers: [AppConfigController],
})
export class AppConfigModule {}

// Dodati u app.module.ts imports
```

### 4.3 APK korišćenje (fallback)

U `AppUpdateService` na APK strani, ako Remote Config fetch ne uspe, pozovi ovaj endpoint kao fallback:

```dart
// U app_update_service.dart — fallback logika
Future<UpdateStatus> checkForUpdate() async {
  try {
    // Primarno: Remote Config
    return _checkViaRemoteConfig();
  } catch (_) {
    // Fallback: API endpoint
    return _checkViaApi();
  }
}

Future<UpdateStatus> _checkViaApi() async {
  final response = await _dio.get('/api/app-config/version');
  final data = response.data;
  final currentVersion = (await PackageInfo.fromPlatform()).version;

  if (isVersionOlder(currentVersion, data['minVersion'])) {
    return UpdateStatus.forceUpdate;
  }
  if (isVersionOlder(currentVersion, data['latestVersion'])) {
    return UpdateStatus.softUpdate;
  }
  return UpdateStatus.upToDate;
}
```

---

## 5. Firebase Admin SDK konfiguracija (provera)

### 5.1 Provera: Da li je Firebase Admin SDK već konfigurisan?

Ovo bi trebalo da je urađeno iz originalnog FCM plana. Proveriti da:

1. **`firebase-admin` paket je instaliran:**
   ```bash
   npm list firebase-admin
   # Treba da pokaže verziju, npr. firebase-admin@12.x.x
   ```

2. **ENV varijable postoje:**
   ```bash
   FIREBASE_PROJECT_ID=radar-puls
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@radar-puls.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

3. **Firebase Admin je inicijalizovan u NestJS:**
   ```typescript
   // Negde u app bootstrap-u ili FirebaseModule
   import * as admin from 'firebase-admin';

   admin.initializeApp({
     credential: admin.credential.cert({
       projectId: process.env.FIREBASE_PROJECT_ID,
       clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
       privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
     }),
   });
   ```

Ako bilo šta od ovoga nedostaje, **PRVO** to implementirati.

---

## 6. Faze implementacije

### Faza 1: FCM Payload update (0.5 dana)

1. Otvoriti fajl gde se šalju FCM push notifikacije (`MobilePushService` ili slično)
2. Zameniti payload sa formatom iz sekcije 1.3 — **copy/paste** celu `sendNewReportNotification` metodu
3. Dodati helper metode `getEmoji()`, `getEventTypeLabel()`, `removeInvalidToken()`
4. Dodati Haversine SQL upit za `getTokensInRadius()` iz sekcije 1.5 (ako ne postoji)
5. Testirati:
   - Kreirati report putem API-ja
   - Proveriti da push stigne na uređaj
   - Proveriti da `data` objekat u payload-u ima sve ključeve (`reportId`, `lat`, `lng`, `eventType`)

### Faza 2: Deep Link verifikacija (0.5 dana)

1. Odlučiti: statički fajlovi (Nginx) ili NestJS controller — preporuka: NestJS controller (sekcija 2.5 Opcija B)
2. Ako NestJS: kreirati `well-known.controller.ts` i `well-known.module.ts` — **copy/paste** iz sekcije 2.5
3. Registrovati `WellKnownModule` u `AppModule`
4. Dodati ENV varijable `ANDROID_SHA256_FINGERPRINT` i `APPLE_TEAM_ID`
5. Deploy i testirati:
   ```bash
   curl -s https://radarpuls.com/.well-known/assetlinks.json | jq .
   curl -s https://radarpuls.com/.well-known/apple-app-site-association | jq .
   ```
6. Oba moraju vratiti validan JSON sa pravim vrednostima

### Faza 3: Single report endpoint (0.5 dana)

1. Proveriti da li `GET /api/map/reports/:id` već postoji
2. Ako ne postoji: dodati rutu u `map.controller.ts` — **copy/paste** iz sekcije 3.3
3. Dodati `getReportById()` u `events.service.ts` — **copy/paste** iz sekcije 3.3
4. Testirati:
   ```bash
   curl https://api.radarpuls.com/api/map/reports/SOME_VALID_ID
   # Treba da vrati JSON sa report podacima
   
   curl https://api.radarpuls.com/api/map/reports/invalid-id
   # Treba da vrati 400
   
   curl https://api.radarpuls.com/api/map/reports/00000000-0000-0000-0000-000000000000
   # Treba da vrati 404
   ```

### Faza 4 (OPCIONALNO): App Config endpoint (0.5 dana)

1. Kreirati `app-config.controller.ts` i `app-config.module.ts` — **copy/paste** iz sekcije 4.2
2. Registrovati u `AppModule`
3. Dodati ENV varijable
4. Testirati:
   ```bash
   curl https://api.radarpuls.com/api/app-config/version
   # Treba da vrati JSON sa minVersion, latestVersion, maintenanceMode
   ```

### Ukupno: ~1.5-2 dana rada

---

## Rezime backend promena

| Promena | Kompleksnost | Obavezno? |
|---------|-------------|-----------|
| FCM payload sa `data` za deep linking | 🟢 Niska | ✅ DA — bez ovog deep linking ne radi |
| `assetlinks.json` + `apple-app-site-association` | 🟢 Niska | ✅ DA — bez ovog URL deep linking ne radi |
| `GET /api/map/reports/:id` | 🟢 Niska | ✅ DA — APK treba da dohvati report po ID-u |
| `GET /api/app-config/version` | 🟢 Niska | ⬜ OPCIONALNO — fallback za Remote Config |

---

## ENV varijable za dodati (rezime)

```bash
# ═══ Novi env za deep linking ═══
ANDROID_SHA256_FINGERPRINT=14:6D:E9:83:...
APPLE_TEAM_ID=A1B2C3D4E5

# ═══ Opciono: app config endpoint ═══
APP_MIN_VERSION=1.0.0
APP_LATEST_VERSION=1.0.0
APP_MAINTENANCE_MODE=false
APP_MAINTENANCE_MESSAGE=

# ═══ Firebase (već treba da postoji iz FCM setup-a) ═══
FIREBASE_PROJECT_ID=radar-puls
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@radar-puls.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

**Autor:** AI Agent  
**Revision:** 1.0  
**Zavisnost:** APK plan → `plans/2026-03-18-firebase-dodatne-funkcionalnosti-apk.md`
