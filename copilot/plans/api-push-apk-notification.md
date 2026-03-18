### Odluka: Opcija A — dodati FCM podršku na API

### 1.1 Trenutno stanje API-ja

API koristi **Web Push (VAPID)** protokol:
- Servis: `src/map/push-notifications.service.ts`
- Entitet: `src/database/map-push-subscription.entity.ts` (tabela `map_push_subscriptions`)
- Polja: `endpoint`, `p256dh`, `auth`, `zoneLat`, `zoneLng`, `radiusMeters`, `clientIpHash`, `enabled`
- Trigger: `RealtimePublisher` emituje `new_report` → `PushNotificationsService` šalje Web Push svim pretplatnicima u zoni

Web Push NE podržava native Android/iOS push. Treba dodati FCM kanal.

### 1.2 Backend implementacija (~/radar-puls/api)

#### 1.2.1 Nova tabela: `mobile_push_tokens`

```sql
CREATE TABLE mobile_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fcm_token TEXT NOT NULL UNIQUE,
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('android', 'ios')),
  device_id TEXT NOT NULL,               -- UUID generisan na device-u
  zone_lat DOUBLE PRECISION,             -- opciono: geografska zona
  zone_lng DOUBLE PRECISION,             -- opciono: geografska zona
  radius_meters INT,                      -- opciono: radius zone
  enabled BOOLEAN NOT NULL DEFAULT true,
  app_version VARCHAR(20),               -- verzija APK-a za debugging
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mobile_push_tokens_enabled ON mobile_push_tokens (enabled);
CREATE INDEX idx_mobile_push_tokens_device ON mobile_push_tokens (device_id);
CREATE INDEX idx_mobile_push_tokens_zone ON mobile_push_tokens (zone_lat, zone_lng);
```

#### 1.2.2 Novi entitet: `MobilePushTokenEntity`

**Fajl:** `src/database/mobile-push-token.entity.ts`

```typescript
import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from "typeorm";

@Entity({ name: "mobile_push_tokens" })
@Index("idx_mobile_push_tokens_enabled", ["enabled"])
@Index("idx_mobile_push_tokens_device", ["deviceId"])
@Index("idx_mobile_push_tokens_zone", ["zoneLat", "zoneLng"])
export class MobilePushTokenEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", name: "fcm_token", unique: true })
  fcmToken!: string;

  @Column({ type: "varchar", length: 10 })
  platform!: "android" | "ios";

  @Column({ type: "text", name: "device_id" })
  deviceId!: string;

  @Column({ type: "double precision", name: "zone_lat", nullable: true })
  zoneLat!: number | null;

  @Column({ type: "double precision", name: "zone_lng", nullable: true })
  zoneLng!: number | null;

  @Column({ type: "int", name: "radius_meters", nullable: true })
  radiusMeters!: number | null;

  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  @Column({ type: "varchar", length: 20, name: "app_version", nullable: true })
  appVersion!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
```

#### 1.2.3 Novi DTO-ovi

**Fajl:** `src/map/dto/register-mobile-push.dto.ts`

```typescript
import { Type } from "class-transformer";
import {
  IsIn, IsLatitude, IsLongitude, IsOptional,
  IsString, MaxLength, Min, Max,
} from "class-validator";

export class RegisterMobilePushDto {
  @IsString()
  @MaxLength(512)
  fcmToken!: string;

  @IsIn(["android", "ios"])
  platform!: "android" | "ios";

  @IsString()
  @MaxLength(64)
  deviceId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  zoneLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  zoneLng?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(300)
  @Max(100000)
  radiusMeters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;
}

export class UnregisterMobilePushDto {
  @IsString()
  @MaxLength(512)
  fcmToken!: string;
}
```

#### 1.2.4 Novi servis: `MobilePushService`

**Fajl:** `src/map/mobile-push.service.ts`

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as admin from "firebase-admin";
import { Subscription } from "rxjs";
import { AppLogger } from "../common/app.logger";
import { MobilePushTokenEntity } from "../database/mobile-push-token.entity";
import { MapEventDto } from "../events/dto/map-event.dto";
import { RealtimePublisher } from "../realtime/realtime.publisher";

@Injectable()
export class MobilePushService implements OnModuleInit, OnModuleDestroy {
  private readonly isEnabled: boolean;
  private subscription: Subscription | null = null;

  constructor(
    @InjectRepository(MobilePushTokenEntity)
    private readonly tokenRepo: Repository<MobilePushTokenEntity>,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    private readonly realtimePublisher: RealtimePublisher,
  ) {
    // Inicijalizuj Firebase Admin SDK ako je konfigurisan
    const projectId = this.configService.get<string>("FCM_PROJECT_ID")?.trim() ?? "";
    this.isEnabled = projectId.length > 0;

    if (this.isEnabled && !admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail: this.configService.get<string>("FCM_CLIENT_EMAIL") ?? "",
          privateKey: (this.configService.get<string>("FCM_PRIVATE_KEY") ?? "")
            .replace(/\\n/g, "\n"),
        }),
      });
    }
  }

  onModuleInit(): void {
    this.subscription = this.realtimePublisher.events$.subscribe((event) => {
      if (event.type !== "new_report") return;
      const payload = event.payload as MapEventDto | undefined;
      if (payload) {
        void this.sendToMobileDevices(payload);
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  async registerToken(dto: {
    fcmToken: string;
    platform: "android" | "ios";
    deviceId: string;
    zoneLat?: number;
    zoneLng?: number;
    radiusMeters?: number;
    appVersion?: string;
  }): Promise<{ status: "registered" }> {
    await this.tokenRepo.upsert(
      {
        fcmToken: dto.fcmToken,
        platform: dto.platform,
        deviceId: dto.deviceId,
        zoneLat: dto.zoneLat ?? null,
        zoneLng: dto.zoneLng ?? null,
        radiusMeters: dto.radiusMeters ?? null,
        appVersion: dto.appVersion ?? null,
        enabled: true,
      },
      ["fcmToken"],
    );
    return { status: "registered" };
  }

  async unregisterToken(fcmToken: string): Promise<{ status: "unregistered" }> {
    await this.tokenRepo.delete({ fcmToken });
    return { status: "unregistered" };
  }

  private async sendToMobileDevices(report: MapEventDto): Promise<void> {
    if (!this.isEnabled) return;

    const tokens = await this.tokenRepo.find({ where: { enabled: true } });
    if (tokens.length === 0) return;

    const title = this.getTitle(report.eventType);
    const body = report.locationText ?? report.description ?? "Nova prijava";

    // Filtriraj po zoni i pošalji batch
    const eligibleTokens = tokens
      .filter((t) => this.isInZone(report, t))
      .map((t) => t.fcmToken);

    if (eligibleTokens.length === 0) return;

    // Firebase podržava batch do 500 tokena
    const batchSize = 500;
    for (let i = 0; i < eligibleTokens.length; i += batchSize) {
      const batch = eligibleTokens.slice(i, i + batchSize);
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          data: {
            reportId: report.id,
            eventType: report.eventType,
            locationText: report.locationText ?? "",
            lat: String(report.lat ?? ""),
            lng: String(report.lng ?? ""),
          },
          android: {
            priority: "high",
            notification: {
              channelId: "radar_puls_alerts",
              sound: `alert_${report.eventType}`,
              priority: "high",
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
          },
        });

        // Obradi neuspele tokene
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const code = resp.error.code;
            if (
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token"
            ) {
              void this.tokenRepo.update(
                { fcmToken: batch[idx] },
                { enabled: false },
              );
            }
          }
        });
      } catch (error) {
        this.logger.error("fcm_send_failed", {
          batch_size: batch.length,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }

  private getTitle(eventType: string): string {
    const titles: Record<string, string> = {
      police: "🚔 Policija",
      radar: "📡 Radar",
      accident: "🚨 Nesreća",
      traffic_jam: "🚗 Gužva",
      control: "🛑 Kontrola",
      unknown: "⚠️ Prijava",
    };
    return `Radar Puls: ${titles[eventType] ?? eventType}`;
  }

  private isInZone(report: MapEventDto, token: MobilePushTokenEntity): boolean {
    if (!token.zoneLat || !token.zoneLng || !token.radiusMeters) return true;
    if (!report.lat || !report.lng) return false;

    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(report.lat - token.zoneLat);
    const dLon = toRad(report.lng - token.zoneLng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(token.zoneLat)) *
        Math.cos(toRad(report.lat)) *
        Math.sin(dLon / 2) ** 2;
    const distance = 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return distance <= token.radiusMeters;
  }
}
```

#### 1.2.5 Novi endpoint-i u `MapController`

Dodati u `src/map/map.controller.ts`:

```typescript
// Dodati importove:
import { RegisterMobilePushDto, UnregisterMobilePushDto } from "./dto/register-mobile-push.dto";
import { MobilePushService } from "./mobile-push.service";

// Dodati u constructor:
// private readonly mobilePushService: MobilePushService

// Novi endpoint-i:
@Post("/mobile/register-device")
@UseGuards(PublicMapRateLimitGuard)
async registerMobileDevice(
  @Body() body: RegisterMobilePushDto,
): Promise<{ status: "registered" }> {
  return this.mobilePushService.registerToken(body);
}

@Delete("/mobile/register-device")
@UseGuards(PublicMapRateLimitGuard)
async unregisterMobileDevice(
  @Body() body: UnregisterMobilePushDto,
): Promise<{ status: "unregistered" }> {
  return this.mobilePushService.unregisterToken(body.fcmToken);
}
```

#### 1.2.6 Nove env varijable

Dodati u `.env.example`:

```env
# ── Firebase Cloud Messaging (mobile push) ──
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
```

#### 1.2.7 Novi npm paket

```bash
cd ~/radar-puls/api
npm install firebase-admin
```

#### 1.2.8 Nova migracija

```bash
npx typeorm migration:create src/database/migrations/AddMobilePushTokens
```

Sadržaj migracije:

```typescript
export class AddMobilePushTokens1710748800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mobile_push_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fcm_token TEXT NOT NULL UNIQUE,
        platform VARCHAR(10) NOT NULL CHECK (platform IN ('android', 'ios')),
        device_id TEXT NOT NULL,
        zone_lat DOUBLE PRECISION,
        zone_lng DOUBLE PRECISION,
        radius_meters INT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        app_version VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_mobile_push_tokens_enabled ON mobile_push_tokens (enabled);
      CREATE INDEX idx_mobile_push_tokens_device ON mobile_push_tokens (device_id);
      CREATE INDEX idx_mobile_push_tokens_zone ON mobile_push_tokens (zone_lat, zone_lng);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mobile_push_tokens;`);
  }
}
```

#### 1.2.9 Registracija u modulu

Dodati `MobilePushTokenEntity` u TypeORM entities i `MobilePushService` u map module providers.

#### 1.2.10 Backend koraci — checklist

1. [ ] `npm install firebase-admin`
2. [ ] Kreirati `src/database/mobile-push-token.entity.ts`
3. [ ] Kreirati `src/map/dto/register-mobile-push.dto.ts`
4. [ ] Kreirati `src/map/mobile-push.service.ts`
5. [ ] Dodati endpoint-e u `src/map/map.controller.ts`
6. [ ] Registrovati entity i service u `src/map/map.module.ts` (ili `app.module.ts`)
7. [ ] Kreirati migraciju i pokrenuti
8. [ ] Dodati env varijable u `.env.example` i `.env`
9. [ ] Firebase Console: kreirati projekat, generisati service account key
10. [ ] Testirati: `POST /api/map/mobile/register-device` sa test tokenom
11. [ ] Testirati: submit report → provera da FCM šalje notifikaciju