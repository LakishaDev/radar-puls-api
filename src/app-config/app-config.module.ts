import { Module } from "@nestjs/common";
import { AppConfigController } from "./app-config.controller";
import { AppConfigRateLimitGuard } from "./app-config-rate-limit.guard";
import { AppConfigService } from "./app-config.service";

@Module({
  controllers: [AppConfigController],
  providers: [AppConfigService, AppConfigRateLimitGuard],
  exports: [AppConfigService],
})
export class AppConfigModule {}
