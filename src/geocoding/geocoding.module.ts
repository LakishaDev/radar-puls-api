import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppLogger } from "../common/app.logger";
import { GeocodingCacheEntity } from "../database/geocoding-cache.entity";
import { LocationAliasEntity } from "../database/location-alias.entity";
import { GeocodingService } from "./geocoding.service";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([GeocodingCacheEntity, LocationAliasEntity]),
  ],
  providers: [GeocodingService, AppLogger],
  exports: [GeocodingService],
})
export class GeocodingModule {}
