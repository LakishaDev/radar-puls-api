import "reflect-metadata";
import * as dotenv from "dotenv";
import { DataSource } from "typeorm";

dotenv.config();
import { GeocodingCacheEntity } from "./geocoding-cache.entity";
import { RawEventEntity } from "./raw-event.entity";
import { ParsedEventEntity } from "./parsed-event.entity";
import { MapPushSubscriptionEntity } from "./map-push-subscription.entity";

const migrationGlob = __filename.endsWith(".ts")
  ? "src/database/migrations/*.ts"
  : "dist/database/migrations/*.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [
    RawEventEntity,
    ParsedEventEntity,
    MapPushSubscriptionEntity,
    GeocodingCacheEntity,
  ],
  migrations: [migrationGlob],
  synchronize: false,
});
