import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppLogger } from "../common/app.logger";
import { MobilePushTokenEntity } from "../database/mobile-push-token.entity";
import { MapPushSubscriptionEntity } from "../database/map-push-subscription.entity";
import { EventsModule } from "../events/events.module";
import { MapController } from "./map.controller";
import { MobilePushService } from "./mobile-push.service";
import { PublicCaptchaService } from "./public-captcha.service";
import { PublicMapRateLimitGuard } from "./public-map-rate-limit.guard";
import { PublicSubmissionRateLimitGuard } from "./public-submission-rate-limit.guard";
import { PushNotificationsService } from "./push-notifications.service";

@Module({
  imports: [
    ConfigModule,
    EventsModule,
    TypeOrmModule.forFeature([MapPushSubscriptionEntity, MobilePushTokenEntity]),
  ],
  controllers: [MapController],
  providers: [
    PublicMapRateLimitGuard,
    PublicSubmissionRateLimitGuard,
    PublicCaptchaService,
    PushNotificationsService,
    MobilePushService,
    AppLogger,
  ],
})
export class MapModule {}
