import { Controller, Get, Header } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Controller("/.well-known")
export class WellKnownController {
  constructor(private readonly configService: ConfigService) {}

  @Get("/assetlinks.json")
  @Header("Content-Type", "application/json")
  getAssetLinks(): Array<{
    relation: string[];
    target: {
      namespace: string;
      package_name: string;
      sha256_cert_fingerprints: string[];
    };
  }> {
    const fingerprint =
      this.configService.get<string>("ANDROID_SHA256_FINGERPRINT", "") ||
      "TODO_REPLACE_WITH_RELEASE_SHA256";

    return [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.radarpuls.app",
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ];
  }

  @Get("/apple-app-site-association")
  @Header("Content-Type", "application/json")
  getAppleAppSiteAssociation(): {
    applinks: {
      apps: [];
      details: Array<{
        appID: string;
        paths: string[];
      }>;
    };
  } {
    const teamIdRaw = this.configService.get<string>("APPLE_TEAM_ID", "TEAM_ID");
    const teamId = teamIdRaw?.trim() || "TEAM_ID";

    return {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.com.radarpuls.app`,
            paths: ["/report/*"],
          },
        ],
      },
    };
  }
}
