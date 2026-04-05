import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AppLogger } from "../common/app.logger";
import { AdminActivityLogEntity } from "../database/admin-activity-log.entity";
import { EnrichmentCacheEntity } from "../database/enrichment-cache.entity";
import { GeocodingCacheEntity } from "../database/geocoding-cache.entity";
import { LocationAliasEntity } from "../database/location-alias.entity";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { RawEventEntity } from "../database/raw-event.entity";
import { EnrichmentModule } from "../enrichment/enrichment.module";
import { AdminActivityLogService } from "./admin-activity-log.service";
import { AdminController } from "./admin.controller";
import { AdminEnrichmentCacheController } from "./admin-enrichment-cache.controller";
import { AdminEnrichmentCacheService } from "./admin-enrichment-cache.service";
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
      EnrichmentCacheEntity,
      AdminActivityLogEntity,
      LocationAliasEntity,
    ]),
    AuthModule,
    EnrichmentModule,
  ],
  controllers: [
    AdminController,
    AdminGeocodingCacheController,
    AdminEnrichmentCacheController,
    AdminLocationAliasesController,
  ],
  providers: [
    AdminService,
    AdminActivityLogService,
    AdminGeocodingCacheService,
    AdminEnrichmentCacheService,
    AdminLocationAliasesService,
    AppLogger,
  ],
})
export class AdminModule {}
