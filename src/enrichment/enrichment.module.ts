import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppLogger } from "../common/app.logger";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { EnrichmentService } from "./enrichment.service";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([ParsedEventEntity]), GeocodingModule],
  providers: [EnrichmentService, AppLogger],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}