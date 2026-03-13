import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppLogger } from "../common/app.logger";
import { GeocodingService } from "./geocoding.service";

@Module({
  imports: [ConfigModule],
  providers: [GeocodingService, AppLogger],
  exports: [GeocodingService],
})
export class GeocodingModule {}
