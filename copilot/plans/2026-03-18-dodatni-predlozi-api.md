# Radar Puls — Dodatni predlozi: API Backend implementacija

> **Datum:** 2026-03-18  
> **Scope:** Samo NestJS API backend. Za APK → `plans/2026-03-18-dodatni-predlozi-apk.md`  
> **Status:** Odobren za implementaciju  
> **Tech stack:** NestJS, TypeScript  
> **Zavisnosti:** `plans/2026-03-18-firebase-dodatne-funkcionalnosti-api.md` (Firebase Admin SDK mora biti konfigurisan)

---

## Sadržaj

1. [Fallback API endpoint za verziju i konfiguraciju](#1-fallback-api-endpoint)
2. [Announcement endpoint — alternativa Remote Config-u](#2-announcement-endpoint)
3. [Health check endpoint za monitoring](#3-health-check-endpoint)
4. [Faze implementacije](#4-faze-implementacije)

---

## Kontekst

Od 6 dodatnih predloga, većina je čisto klijentska (APK) strana:

| Predlog | Backend? | Razlog |
|---------|----------|--------|
| Firebase In-App Messaging | ❌ | Konfiguracija 100% u Firebase Console |
| Firebase App Distribution + CI/CD | ❌ | GitHub Actions → Firebase CLI, ne dodiruje API |
| A/B testiranje (Remote Config) | ❌ | Konfiguracija 100% u Firebase Console |
| Announcement banner | ⬜ OPCIONO | Primarno Remote Config; API fallback ispod |
| Fallback API endpoint za verziju | ✅ DA | **Ovo je glavni API rad** |
| Custom Crashlytics keys | ❌ | Potpuno APK strana |

Ovaj plan pokriva API endpoint-e koji služe kao **fallback** kad Firebase Remote Config nije dostupan + health check za monitoring.

---

## Preduslov

Iz `plans/2026-03-18-firebase-dodatne-funkcionalnosti-api.md`:
- Firebase Admin SDK konfigurisan (sekcija 5)
- `AppConfigModule` **ne postoji** ili postoji samo bazična verzija iz sekcije 4

Ako bazična verzija iz prethodnog plana VEĆ postoji, ovaj plan je **proširuje**. Ako ne postoji, kreirati od nule.

---

## 1. Fallback API endpoint za verziju i konfiguraciju

### 1.1 Zašto

Firebase Remote Config je primarni izvor za:
- `min_app_version` (force update)
- `latest_app_version` (soft update)
- `maintenance_mode`
- `maintenance_message`

Ako Firebase padne (outage, network problem, DNS problem), APK poziva naš API kao fallback. Ovaj endpoint je **kritičan** jer bez njega korisnici sa zastarelom verzijom mogu nastaviti da koriste app koji nije kompatibilan sa API-jem.

### 1.2 Dizajn endpoint-a

```
GET /api/app-config/version
```

**Response format:**

```json
{
  "minVersion": "1.0.0",
  "latestVersion": "1.2.0",
  "maintenanceMode": false,
  "maintenanceMessage": "",
  "forceUpdateMessage": "Obavezno ažuriranje — nova verzija ispravlja kritičnu grešku.",
  "storeUrls": {
    "android": "https://play.google.com/store/apps/details?id=com.radarpuls.app",
    "ios": "https://apps.apple.com/app/radar-puls/id123456789"
  }
}
```

### 1.3 Implementacija — AppConfigService

**Fajl: `src/app-config/app-config.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AppVersionInfo {
  minVersion: string;
  latestVersion: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  forceUpdateMessage: string;
  storeUrls: {
    android: string;
    ios: string;
  };
}

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  getVersionInfo(): AppVersionInfo {
    return {
      minVersion: this.configService.get<string>('APP_MIN_VERSION', '1.0.0'),
      latestVersion: this.configService.get<string>('APP_LATEST_VERSION', '1.0.0'),
      maintenanceMode: this.configService.get<string>('APP_MAINTENANCE_MODE', 'false') === 'true',
      maintenanceMessage: this.configService.get<string>('APP_MAINTENANCE_MESSAGE', ''),
      forceUpdateMessage: this.configService.get<string>(
        'APP_FORCE_UPDATE_MESSAGE',
        'Potrebno je ažuriranje aplikacije za nastavak korišćenja.',
      ),
      storeUrls: {
        android: this.configService.get<string>(
          'APP_PLAY_STORE_URL',
          'https://play.google.com/store/apps/details?id=com.radarpuls.app',
        ),
        ios: this.configService.get<string>(
          'APP_APPLE_STORE_URL',
          'https://apps.apple.com/app/radar-puls/id123456789',
        ),
      },
    };
  }
}
```

### 1.4 Implementacija — AppConfigController

**Fajl: `src/app-config/app-config.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { AppConfigService, AppVersionInfo } from './app-config.service';
import { Throttle } from '@nestjs/throttler';

@Controller('api/app-config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  /**
   * Fallback endpoint za app verziju i maintenance status.
   * APK koristi ovo kad Firebase Remote Config nije dostupan.
   *
   * Rate limit: 30 req/min po IP — sprečava abuse ali dozvoljava
   * normalan app startup flow.
   */
  @Get('version')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  getVersionInfo(): AppVersionInfo {
    return this.appConfigService.getVersionInfo();
  }
}
```

### 1.5 Implementacija — AppConfigModule

**Fajl: `src/app-config/app-config.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';

@Module({
  controllers: [AppConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
```

### 1.6 Registracija u AppModule

**Fajl: `src/app.module.ts`** — dodati import:

```typescript
import { AppConfigModule } from './app-config/app-config.module';

@Module({
  imports: [
    // ... postojeći moduli ...
    AppConfigModule,  // ← DODATI
  ],
})
export class AppModule {}
```

### 1.7 ENV varijable

Dodati u `.env`:

```bash
# ═══ App Config — Fallback za Remote Config ═══
APP_MIN_VERSION=1.0.0
APP_LATEST_VERSION=1.0.0
APP_MAINTENANCE_MODE=false
APP_MAINTENANCE_MESSAGE=
APP_FORCE_UPDATE_MESSAGE=Potrebno je ažuriranje aplikacije za nastavak korišćenja.
APP_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.radarpuls.app
APP_APPLE_STORE_URL=https://apps.apple.com/app/radar-puls/id123456789
```

Dodati u `.env.example` sa istim ključevima i placeholder vrednostima.

### 1.8 Ažuriranje verzije pri release-u

Kad push-uješ novu verziju na Play Store:

1. Update **Firebase Remote Config** (primarni izvor):
   - `latest_app_version` → nova verzija
   - `min_app_version` → ažuriraj ako stara verzija nije kompatibilna

2. Update **ENV varijable na serveru** (fallback):
   - `APP_LATEST_VERSION` → ista nova verzija
   - `APP_MIN_VERSION` → isto kao Remote Config

**OBAVEZNO:** Oba izvora moraju imati iste vrednosti. Ako se razlikuju, korisnici dobijaju nekonzistentno ponašanje zavisno od toga koji izvor APK koristi.

### 1.9 Opcija: Config iz baze umesto ENV-a

Ako se verzija menja često i ne želiš redeploy API-ja samo za promenu verzije, alternativa je čuvanje u bazi:

**Fajl: `src/app-config/entities/app-config.entity.ts`**

```typescript
import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('app_config')
export class AppConfigEntity {
  @PrimaryColumn()
  key: string;

  @Column()
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

```sql
-- Inicijalni seed
INSERT INTO app_config (key, value) VALUES
  ('min_version', '1.0.0'),
  ('latest_version', '1.0.0'),
  ('maintenance_mode', 'false'),
  ('maintenance_message', ''),
  ('force_update_message', 'Potrebno je ažuriranje aplikacije za nastavak korišćenja.'),
  ('play_store_url', 'https://play.google.com/store/apps/details?id=com.radarpuls.app'),
  ('apple_store_url', 'https://apps.apple.com/app/radar-puls/id123456789');
```

Onda bi `AppConfigService.getVersionInfo()` čitao iz baze (sa kešom od 5 min) umesto iz ENV-a. Vrednosti se menjaju SQL-om ili admin endpoint-om bez redeploy-a.

**Preporuka:** Počni sa ENV pristupom (jednostavnije). Prebaci na bazu kasnije ako se pokaže da je potrebno.

### 1.10 Testiranje

```bash
# 1. Standardni response
curl -s http://localhost:3000/api/app-config/version | jq .
# Očekivano: JSON sa svim poljima

# 2. Rate limit test
for i in {1..35}; do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/app-config/version
  echo " ($i)"
done
# Prvih 30 → 200, posle toga → 429

# 3. Maintenance mode test
# Postavi APP_MAINTENANCE_MODE=true u .env → restart server
curl -s http://localhost:3000/api/app-config/version | jq '.maintenanceMode'
# Očekivano: true
```

---

## 2. Announcement endpoint — alternativa Remote Config-u

### 2.1 Zašto

Announcement banner na APK strani primarno koristi Remote Config ključeve (`announcement_text`, `announcement_type`, itd.). Ovaj endpoint služi kao:
1. **Fallback** — kad Remote Config ne radi
2. **Alternativa** — ako su potrebni kompleksni announcement-i (npr. više announcement-a istovremeno, scheduling, targeting)

**Ovo je OPCIONALNO.** Ako Remote Config pokriva sve potrebe, ovaj endpoint se može preskočiti.

### 2.2 Endpoint dizajn

```
GET /api/app-config/announcements
```

**Response:**

```json
{
  "announcements": [
    {
      "id": "maintenance-2026-03-20",
      "text": "Planirano održavanje sutra od 02:00 do 04:00.",
      "type": "warning",
      "url": "",
      "dismissible": true,
      "priority": 1,
      "startsAt": "2026-03-19T00:00:00Z",
      "expiresAt": "2026-03-20T05:00:00Z"
    }
  ]
}
```

### 2.3 Implementacija

**Fajl: `src/app-config/app-config.controller.ts`** — dodati rutu:

```typescript
import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppConfigService } from './app-config.service';

@Controller('api/app-config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Get('version')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  getVersionInfo() {
    return this.appConfigService.getVersionInfo();
  }

  /**
   * Aktivni announcement-i.
   * APK koristi ovo kao fallback kad Remote Config ne radi,
   * ili za kompleksne announcement scenarije.
   */
  @Get('announcements')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  getAnnouncements() {
    return this.appConfigService.getActiveAnnouncements();
  }
}
```

**Fajl: `src/app-config/app-config.service.ts`** — dodati metodu:

```typescript
export interface Announcement {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'success';
  url: string;
  dismissible: boolean;
  priority: number;
  startsAt: string | null;
  expiresAt: string | null;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  // ... getVersionInfo() ostaje isti ...

  getActiveAnnouncements(): { announcements: Announcement[] } {
    // JEDNOSTAVNA VERZIJA: čitaj iz ENV-a (jedan announcement)
    const text = this.configService.get<string>('APP_ANNOUNCEMENT_TEXT', '');

    if (!text) {
      return { announcements: [] };
    }

    return {
      announcements: [
        {
          id: this.configService.get<string>('APP_ANNOUNCEMENT_ID', 'default'),
          text,
          type: (this.configService.get<string>('APP_ANNOUNCEMENT_TYPE', 'info') as Announcement['type']),
          url: this.configService.get<string>('APP_ANNOUNCEMENT_URL', ''),
          dismissible: this.configService.get<string>('APP_ANNOUNCEMENT_DISMISSIBLE', 'true') === 'true',
          priority: 1,
          startsAt: null,
          expiresAt: null,
        },
      ],
    };
  }
}
```

### 2.4 ENV varijable za announcement

```bash
# ═══ Announcement (opciono) ═══
APP_ANNOUNCEMENT_TEXT=
APP_ANNOUNCEMENT_TYPE=info
APP_ANNOUNCEMENT_URL=
APP_ANNOUNCEMENT_ID=default
APP_ANNOUNCEMENT_DISMISSIBLE=true
```

### 2.5 Napredna verzija: announcement-i iz baze sa scheduling-om

Ako je potrebno više announcement-a ili zakazivanje unapred:

**Fajl: `src/app-config/entities/announcement.entity.ts`**

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('announcements')
export class AnnouncementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  text: string;

  @Column({ default: 'info' })
  type: string; // 'info' | 'warning' | 'success'

  @Column({ default: '' })
  url: string;

  @Column({ default: true })
  dismissible: boolean;

  @Column({ default: 1 })
  priority: number;

  @Column({ type: 'timestamp', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Fajl: `src/app-config/app-config.service.ts`** — proširena verzija:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, IsNull, Or } from 'typeorm';
import { AnnouncementEntity } from './entities/announcement.entity';

@Injectable()
export class AppConfigService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AnnouncementEntity)
    private readonly announcementRepo: Repository<AnnouncementEntity>,
  ) {}

  async getActiveAnnouncements(): Promise<{ announcements: Announcement[] }> {
    const now = new Date();

    const entities = await this.announcementRepo.find({
      where: {
        active: true,
        startsAt: Or(IsNull(), LessThanOrEqual(now)),
        expiresAt: Or(IsNull(), MoreThanOrEqual(now)),
      },
      order: { priority: 'ASC' },
      take: 5, // Maksimalno 5 announcement-a odjednom
    });

    return {
      announcements: entities.map((e) => ({
        id: e.id,
        text: e.text,
        type: e.type as Announcement['type'],
        url: e.url,
        dismissible: e.dismissible,
        priority: e.priority,
        startsAt: e.startsAt?.toISOString() ?? null,
        expiresAt: e.expiresAt?.toISOString() ?? null,
      })),
    };
  }
}
```

**Preporuka:** Počni sa ENV pristupom (sekcija 2.3). Prebaci na bazu verziju kad bude potreban scheduling ili višestruki announcement-i.

---

## 3. Health Check endpoint za monitoring

### 3.1 Zašto

Kad APK ima fallback na API za verziju, moramo znati da li je API uopšte dostupan. Health check endpoint:
- API koristi za liveness/readiness probe (Kubernetes, Docker, Railway)
- Monitoring servisi (UptimeRobot, Better Uptime) ping-uju
- APK može koristiti za brzu proveru pre fallback poziva

### 3.2 Implementacija

**Fajl: `src/health/health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
```

**Fajl: `src/health/health.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

**Registracija u `app.module.ts`:**

```typescript
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // ... postojeći moduli ...
    HealthModule,  // ← DODATI
  ],
})
export class AppModule {}
```

### 3.3 APK korišćenje health check-a

APK može da ping-uje health endpoint pre fallback poziva:

```dart
// U AppUpdateService na APK strani
Future<bool> _isApiAvailable() async {
  try {
    final response = await _dio.get(
      '/api/health',
      options: Options(
        sendTimeout: const Duration(seconds: 3),
        receiveTimeout: const Duration(seconds: 3),
      ),
    );
    return response.statusCode == 200;
  } catch (_) {
    return false;
  }
}
```

---

## 4. Faze implementacije

### Faza 1: App Config endpoint — verzija (0.5 dana)

1. Kreirati `src/app-config/app-config.service.ts` — sekcija 1.3
2. Kreirati `src/app-config/app-config.controller.ts` — sekcija 1.4
3. Kreirati `src/app-config/app-config.module.ts` — sekcija 1.5
4. Registrovati `AppConfigModule` u `AppModule` — sekcija 1.6
5. Dodati ENV varijable — sekcija 1.7
6. Testirati:
   ```bash
   curl http://localhost:3000/api/app-config/version | jq .
   ```

### Faza 2: Health Check (0.5 dana)

1. Kreirati `src/health/health.controller.ts` — sekcija 3.2
2. Kreirati `src/health/health.module.ts` — sekcija 3.2
3. Registrovati `HealthModule` u `AppModule`
4. Testirati:
   ```bash
   curl http://localhost:3000/api/health
   ```
5. Konfigurisati monitoring servis (UptimeRobot ili Better Uptime) da ping-uje `/api/health` svakih 5 minuta

### Faza 3 (OPCIONALNO): Announcement endpoint (0.5 dana)

1. Dodati `getActiveAnnouncements()` u `AppConfigService` — sekcija 2.3
2. Dodati `GET /api/app-config/announcements` rutu — sekcija 2.3
3. Dodati ENV varijable — sekcija 2.4
4. Testirati:
   ```bash
   curl http://localhost:3000/api/app-config/announcements | jq .
   ```

### Ukupno: ~1-1.5 dana rada

---

## ENV varijable — kompletna lista za dodati

```bash
# ═══ App Config — Fallback za Remote Config ═══
APP_MIN_VERSION=1.0.0
APP_LATEST_VERSION=1.0.0
APP_MAINTENANCE_MODE=false
APP_MAINTENANCE_MESSAGE=
APP_FORCE_UPDATE_MESSAGE=Potrebno je ažuriranje aplikacije za nastavak korišćenja.
APP_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.radarpuls.app
APP_APPLE_STORE_URL=https://apps.apple.com/app/radar-puls/id123456789

# ═══ Announcement (opciono) ═══
APP_ANNOUNCEMENT_TEXT=
APP_ANNOUNCEMENT_TYPE=info
APP_ANNOUNCEMENT_URL=
APP_ANNOUNCEMENT_ID=default
APP_ANNOUNCEMENT_DISMISSIBLE=true
```

---

## Rezime backend promena

| Promena | Kompleksnost | Obavezno? |
|---------|-------------|-----------|
| `GET /api/app-config/version` — fallback za Remote Config | 🟢 Niska | ✅ DA — APK fallback kad Firebase padne |
| `GET /api/health` — health check | 🟢 Niska | ✅ DA — monitoring i liveness probe |
| `GET /api/app-config/announcements` — announcement fallback | 🟢 Niska | ⬜ OPCIONALNO — samo ako Remote Config ne pokriva |

---

## Struktura novih fajlova

```
src/
├── app-config/
│   ├── app-config.controller.ts    # NOVO ili AŽURIRANO
│   ├── app-config.service.ts       # NOVO
│   ├── app-config.module.ts        # NOVO ili AŽURIRANO
│   └── entities/
│       └── announcement.entity.ts  # OPCIONO — samo za baza verziju
├── health/
│   ├── health.controller.ts        # NOVO
│   └── health.module.ts            # NOVO
```

---

**Autor:** AI Agent  
**Revision:** 1.0  
**Zavisnosti:**
- APK plan: `plans/2026-03-18-dodatni-predlozi-apk.md`
- Prethodni API plan: `plans/2026-03-18-firebase-dodatne-funkcionalnosti-api.md`
