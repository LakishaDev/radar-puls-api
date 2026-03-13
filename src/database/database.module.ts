import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MapPushSubscriptionEntity } from "./map-push-subscription.entity";
import { RawEventEntity } from "./raw-event.entity";
import { ParsedEventEntity } from "./parsed-event.entity";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres" as const,
        url: configService.getOrThrow<string>("DATABASE_URL"),
        entities: [RawEventEntity, ParsedEventEntity, MapPushSubscriptionEntity],
        synchronize: false,
        logging: false,
      }),
    }),
    TypeOrmModule.forFeature([
      RawEventEntity,
      ParsedEventEntity,
      MapPushSubscriptionEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
