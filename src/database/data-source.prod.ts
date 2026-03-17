import "reflect-metadata";
import { DataSource } from "typeorm";
import { AdminActivityLogEntity } from "./admin-activity-log.entity";
import { GeocodingCacheEntity } from "./geocoding-cache.entity";
import { LocationAliasEntity } from "./location-alias.entity";
import { RawEventEntity } from "./raw-event.entity";
import { ParsedEventEntity } from "./parsed-event.entity";
import { MapPushSubscriptionEntity } from "./map-push-subscription.entity";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [
    RawEventEntity,
    ParsedEventEntity,
    MapPushSubscriptionEntity,
    GeocodingCacheEntity,
    AdminActivityLogEntity,
    LocationAliasEntity,
  ],
  migrations: ["dist/database/migrations/*.js"],
  synchronize: false,
});
