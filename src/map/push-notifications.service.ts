import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import { Subscription } from "rxjs";
import webpush from "web-push";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { MapPushSubscriptionEntity } from "../database/map-push-subscription.entity";
import { MapEventDto } from "../events/dto/map-event.dto";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { SubscribeMapAlertsDto } from "./dto/subscribe-map-alerts.dto";

@Injectable()
export class PushNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly isEnabled: boolean;
  private notificationSubscription: Subscription | null = null;

  constructor(
    @InjectRepository(MapPushSubscriptionEntity)
    private readonly subscriptionsRepository: Repository<MapPushSubscriptionEntity>,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    @Optional() private readonly realtimePublisher?: RealtimePublisher,
  ) {
    const publicKey = this.configService.get<string>("VAPID_PUBLIC_KEY")?.trim() ?? "";
    const privateKey = this.configService.get<string>("VAPID_PRIVATE_KEY")?.trim() ?? "";
    const subject = this.configService.get<string>("VAPID_SUBJECT")?.trim() ?? "";

    this.isEnabled =
      publicKey.length > 0 && privateKey.length > 0 && subject.length > 0;

    if (this.isEnabled) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } else {
      this.logger.warn("push_notifications_disabled_missing_vapid", {});
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

  async subscribe(
    dto: SubscribeMapAlertsDto,
    clientIp: string,
  ): Promise<{ status: "subscribed" }> {
    const clientIpHash = createHash("sha256").update(clientIp).digest("hex");

    await this.subscriptionsRepository.upsert(
      {
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        zoneLat: dto.zoneLat ?? null,
        zoneLng: dto.zoneLng ?? null,
        radiusMeters: dto.radiusMeters ?? null,
        clientIpHash,
        enabled: true,
      },
      ["endpoint"],
    );

    return { status: "subscribed" };
  }

  async unsubscribe(endpoint: string): Promise<{ status: "unsubscribed" }> {
    await this.subscriptionsRepository.delete({ endpoint });
    return { status: "unsubscribed" };
  }

  private async notifyForReport(report: MapEventDto): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    const subscriptions = await this.subscriptionsRepository.find({
      where: { enabled: true },
    });

    if (subscriptions.length === 0) {
      return;
    }

    const title = `Radar Puls: ${report.eventType}`;
    const body = report.locationText ?? report.description ?? "Nova prijava";
    const payload = JSON.stringify({
      title,
      body,
      data: {
        reportId: report.id,
        eventType: report.eventType,
        locationText: report.locationText,
        lat: report.lat,
        lng: report.lng,
        createdAt: report.createdAt,
      },
    });

    for (const subscription of subscriptions) {
      if (!this.isInZone(report, subscription)) {
        continue;
      }

      const pushSubscription: webpush.PushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : NaN;

        if (statusCode === 404 || statusCode === 410) {
          await this.subscriptionsRepository.update(subscription.id, { enabled: false });
        }

        this.logger.warn("push_notification_send_failed", {
          endpoint: subscription.endpoint,
          report_id: report.id,
          status_code: Number.isFinite(statusCode) ? statusCode : null,
          error: error instanceof Error ? error.message : "unknown push error",
        });
      }
    }
  }

  private isInZone(
    report: MapEventDto,
    subscription: MapPushSubscriptionEntity,
  ): boolean {
    if (
      subscription.zoneLat === null ||
      subscription.zoneLng === null ||
      subscription.radiusMeters === null
    ) {
      return true;
    }

    if (report.lat === null || report.lng === null) {
      return false;
    }

    const distance = this.haversineMeters(
      report.lat,
      report.lng,
      subscription.zoneLat,
      subscription.zoneLng,
    );

    return distance <= subscription.radiusMeters;
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
