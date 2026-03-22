import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { GlobalHttpExceptionFilter } from "../src/common/http-exception.filter";
import { AppConfigModule } from "../src/app-config/app-config.module";
import { HealthModule } from "../src/health/health.module";
import { WellKnownModule } from "../src/well-known/well-known.module";

describe("App Config and Well Known API (e2e)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AppConfigModule, HealthModule, WellKnownModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns app version config", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/app-config/version")
      .expect(200);

    expect(response.body).toMatchObject({
      minVersion: expect.any(String),
      latestVersion: expect.any(String),
      maintenanceMode: expect.any(Boolean),
      maintenanceMessage: expect.any(String),
      forceUpdateMessage: expect.any(String),
      storeUrls: {
        android: expect.any(String),
        ios: expect.any(String),
      },
    });
  });

  it("returns empty announcements by default", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/app-config/announcements")
      .expect(200);

    expect(response.body).toEqual({
      announcements: [],
    });
  });

  it("returns android asset links", async () => {
    const response = await request(app.getHttpServer())
      .get("/.well-known/assetlinks.json")
      .expect(200);

    expect(response.body).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.radarpuls.app",
          sha256_cert_fingerprints: ["TODO_REPLACE_WITH_RELEASE_SHA256"],
        },
      },
    ]);
  });

  it("returns apple app site association", async () => {
    const response = await request(app.getHttpServer())
      .get("/.well-known/apple-app-site-association")
      .expect(200);

    expect(response.body).toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appID: "TEAM_ID.com.radarpuls.app",
            paths: ["/report/*"],
          },
        ],
      },
    });
  });

  it("returns health payload", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/health")
      .expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      timestamp: expect.any(String),
    });
  });
});
