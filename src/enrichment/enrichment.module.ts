import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppLogger } from "../common/app.logger";
import { EnrichmentCacheEntity } from "../database/enrichment-cache.entity";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { EnrichmentCacheService } from "./enrichment-cache.service";
import { EnrichmentService } from "./enrichment.service";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ParsedEventEntity, EnrichmentCacheEntity]),
    GeocodingModule,
  ],
  providers: [EnrichmentService, EnrichmentCacheService, AppLogger],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
