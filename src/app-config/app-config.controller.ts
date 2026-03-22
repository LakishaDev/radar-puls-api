import { Controller, Get, UseGuards } from "@nestjs/common";
import { AppConfigRateLimitGuard } from "./app-config-rate-limit.guard";
import {
  Announcement,
  AppConfigService,
  AppVersionInfo,
} from "./app-config.service";

@Controller("/api/app-config")
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Get("/version")
  @UseGuards(AppConfigRateLimitGuard)
  getVersionInfo(): AppVersionInfo {
    return this.appConfigService.getVersionInfo();
  }

  @Get("/announcements")
  @UseGuards(AppConfigRateLimitGuard)
  getAnnouncements(): { announcements: Announcement[] } {
    return this.appConfigService.getActiveAnnouncements();
  }
}
