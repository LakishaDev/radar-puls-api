import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface AppVersionInfo {
  minVersion: string;
  latestVersion: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  forceUpdateMessage: string;
  storeUrls: {
    android: string;
    ios: string;
  };
}

export interface Announcement {
  id: string;
  text: string;
  type: "info" | "warning" | "success";
  url: string;
  dismissible: boolean;
  priority: number;
  startsAt: string | null;
  expiresAt: string | null;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  getVersionInfo(): AppVersionInfo {
    return {
      minVersion: this.configService.get<string>("APP_MIN_VERSION", "1.0.0"),
      latestVersion: this.configService.get<string>("APP_LATEST_VERSION", "1.0.0"),
      maintenanceMode:
        this.configService.get<string>("APP_MAINTENANCE_MODE", "false") === "true",
      maintenanceMessage: this.configService.get<string>(
        "APP_MAINTENANCE_MESSAGE",
        "",
      ),
      forceUpdateMessage: this.configService.get<string>(
        "APP_FORCE_UPDATE_MESSAGE",
        "Potrebno je azuriranje aplikacije za nastavak koriscenja.",
      ),
      storeUrls: {
        android: this.configService.get<string>(
          "APP_PLAY_STORE_URL",
          "https://play.google.com/store/apps/details?id=com.radarpuls.app",
        ),
        ios: this.configService.get<string>(
          "APP_APPLE_STORE_URL",
          "https://apps.apple.com/app/radar-puls/id123456789",
        ),
      },
    };
  }

  getActiveAnnouncements(): { announcements: Announcement[] } {
    const text = this.configService.get<string>("APP_ANNOUNCEMENT_TEXT", "");

    if (!text) {
      return { announcements: [] };
    }

    const typeRaw = this.configService.get<string>("APP_ANNOUNCEMENT_TYPE", "info");
    const type: Announcement["type"] =
      typeRaw === "warning" || typeRaw === "success" ? typeRaw : "info";

    return {
      announcements: [
        {
          id: this.configService.get<string>("APP_ANNOUNCEMENT_ID", "default"),
          text,
          type,
          url: this.configService.get<string>("APP_ANNOUNCEMENT_URL", ""),
          dismissible:
            this.configService.get<string>("APP_ANNOUNCEMENT_DISMISSIBLE", "true") ===
            "true",
          priority: 1,
          startsAt: null,
          expiresAt: null,
        },
      ],
    };
  }
}
