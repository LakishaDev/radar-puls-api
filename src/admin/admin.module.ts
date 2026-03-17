import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AppLogger } from "../common/app.logger";
import { AdminActivityLogEntity } from "../database/admin-activity-log.entity";
import { GeocodingCacheEntity } from "../database/geocoding-cache.entity";
import { LocationAliasEntity } from "../database/location-alias.entity";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { RawEventEntity } from "../database/raw-event.entity";
import { AdminActivityLogService } from "./admin-activity-log.service";
import { AdminController } from "./admin.controller";
import { AdminGeocodingCacheController } from "./admin-geocoding-cache.controller";
import { AdminGeocodingCacheService } from "./admin-geocoding-cache.service";
import { AdminLocationAliasesController } from "./admin-location-aliases.controller";
import { AdminLocationAliasesService } from "./admin-location-aliases.service";
import { AdminService } from "./admin.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ParsedEventEntity,
      RawEventEntity,
      GeocodingCacheEntity,
      AdminActivityLogEntity,
      LocationAliasEntity,
    ]),
    AuthModule,
  ],
  controllers: [
    AdminController,
    AdminGeocodingCacheController,
    AdminLocationAliasesController,
  ],
  providers: [
    AdminService,
    AdminActivityLogService,
    AdminGeocodingCacheService,
    AdminLocationAliasesService,
    AppLogger,
  ],
})
export class AdminModule {}
