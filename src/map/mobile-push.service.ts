import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { Subscription } from "rxjs";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { MobilePushTokenEntity } from "../database/mobile-push-token.entity";
import { MapEventDto } from "../events/dto/map-event.dto";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { RegisterMobilePushDto } from "./dto/register-mobile-push.dto";

@Injectable()
export class MobilePushService implements OnModuleInit, OnModuleDestroy {
  private readonly isEnabled: boolean;
  private notificationSubscription: Subscription | null = null;

  constructor(
    @InjectRepository(MobilePushTokenEntity)
    private readonly tokenRepository: Repository<MobilePushTokenEntity>,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    @Optional() private readonly realtimePublisher?: RealtimePublisher,
  ) {
    const projectId = this.configService.get<string>("FCM_PROJECT_ID")?.trim() ?? "";
    const clientEmail =
      this.configService.get<string>("FCM_CLIENT_EMAIL")?.trim() ?? "";
    const privateKeyRaw =
      this.configService.get<string>("FCM_PRIVATE_KEY")?.trim() ?? "";
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

    this.isEnabled =
      projectId.length > 0 && clientEmail.length > 0 && privateKey.length > 0;

    if (!this.isEnabled) {
      this.logger.warn("mobile_push_disabled_missing_fcm_config", {});
      return;
    }

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
  }

  onModuleInit(): void {
    if (!this.realtimePublisher) {
      return;
    }

    this.notificationSubscription = this.realtimePublisher.events$.subscribe((event) => {
      if (event.type !== "new_report") {
        return;
      }

      const payload = event.payload as MapEventDto | undefined;
      if (!payload) {
        return;
      }

      void this.notifyForReport(payload);
    });
  }

  onModuleDestroy(): void {
    if (this.notificationSubscription) {
      this.notificationSubscription.unsubscribe();
      this.notificationSubscription = null;
    }
  }

  async registerToken(
    dto: RegisterMobilePushDto,
  ): Promise<{ status: "registered" }> {
    await this.tokenRepository.upsert(
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

  async unregisterToken(
    fcmToken: string,
  ): Promise<{ status: "unregistered" }> {
    await this.tokenRepository.delete({ fcmToken });
    return { status: "unregistered" };
  }

  private async notifyForReport(report: MapEventDto): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    const tokens = await this.tokenRepository.find({
      where: { enabled: true },
    });

    if (tokens.length === 0) {
      return;
    }

    const eligibleTokens = tokens
      .filter((token) => this.isInZone(report, token))
      .map((token) => token.fcmToken);

    if (eligibleTokens.length === 0) {
      return;
    }

    const title = this.getTitle(report.eventType);
    const body = report.locationText ?? report.description ?? "Nova prijava";
    const batchSize = 500;

    for (let i = 0; i < eligibleTokens.length; i += batchSize) {
      const batch = eligibleTokens.slice(i, i + batchSize);

      try {
        const response = await getMessaging().sendEachForMulticast({
          tokens: batch,
          notification: {
            title,
            body,
          },
          data: {
            reportId: report.id,
            eventType: report.eventType,
            locationText: report.locationText ?? "",
            lat: report.lat === null ? "" : String(report.lat),
            lng: report.lng === null ? "" : String(report.lng),
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

        await Promise.all(
          response.responses.map(async (item, index) => {
            if (item.success || !item.error) {
              return;
            }

            const code = item.error.code;
            if (
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token"
            ) {
              await this.tokenRepository.update(
                { fcmToken: batch[index] },
                { enabled: false },
              );
            }
          }),
        );
      } catch (error) {
        this.logger.error("mobile_push_send_failed", {
          batch_size: batch.length,
          report_id: report.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }

  private getTitle(eventType: string): string {
    const labels: Record<string, string> = {
      police: "Policija",
      radar: "Radar",
      accident: "Nesreca",
      traffic_jam: "Guzva",
      control: "Kontrola",
      unknown: "Prijava",
    };

    return `Radar Puls: ${labels[eventType] ?? eventType}`;
  }

  private isInZone(report: MapEventDto, token: MobilePushTokenEntity): boolean {
    if (
      token.zoneLat === null ||
      token.zoneLng === null ||
      token.radiusMeters === null
    ) {
      return true;
    }

    if (report.lat === null || report.lng === null) {
      return false;
    }

    const distance = this.haversineMeters(
      report.lat,
      report.lng,
      token.zoneLat,
      token.zoneLng,
    );

    return distance <= token.radiusMeters;
  }

  private haversineMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (value: number): number => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    return 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}