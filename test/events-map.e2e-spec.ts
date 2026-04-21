import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { NextFunction, Request, Response } from "express";
import request from "supertest";
import { getRepositoryToken } from "@nestjs/typeorm";
import { GlobalHttpExceptionFilter } from "../src/common/http-exception.filter";
import { MapPushSubscriptionEntity } from "../src/database/map-push-subscription.entity";
import { MobilePushTokenEntity } from "../src/database/mobile-push-token.entity";
import { ParsedEventEntity } from "../src/database/parsed-event.entity";
import { RawEventEntity } from "../src/database/raw-event.entity";
import { EventsModule } from "../src/events/events.module";
import { MapModule } from "../src/map/map.module";
import { StatsModule } from "../src/stats/stats.module";
import { DeviceTokenService } from "../src/auth/device-token.service";
import { MobileUserEntity } from "../src/mobile-users/mobile-user.entity";
import { ReferralEntity } from "../src/referrals/referral.entity";
import { ReferralCodeEntity } from "../src/referrals/referral-code.entity";

describe("Events Map API (e2e)", () => {
  let app: INestApplication;

  const rawRepositoryMock = {
    create: jest.fn((value) => value),
    save: jest.fn(),
  };

  const parsedRepositoryMock = {
    query: jest.fn(),
  };

  const mapPushSubscriptionsRepositoryMock = {
    upsert: jest.fn(),
    delete: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  };

  const mobilePushTokenRepositoryMock = {
    upsert: jest.fn(),
    delete: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  };

  const tokenServiceMock = {
    assertAuthorized: jest.fn(),
    assertTokenAuthorized: jest.fn((token: string) => {
      if (token === "dev-token-01") {
        return;
      }
      throw new UnauthorizedException();
    }),
  };

  beforeEach(async () => {
    rawRepositoryMock.create.mockClear();
    rawRepositoryMock.save.mockReset();
    parsedRepositoryMock.query.mockReset();
    mapPushSubscriptionsRepositoryMock.upsert.mockReset();
    mapPushSubscriptionsRepositoryMock.delete.mockReset();
    mapPushSubscriptionsRepositoryMock.find.mockResolvedValue([]);
    mapPushSubscriptionsRepositoryMock.update.mockReset();
    mobilePushTokenRepositoryMock.upsert.mockReset();
    mobilePushTokenRepositoryMock.delete.mockReset();
    mobilePushTokenRepositoryMock.find.mockResolvedValue([]);
    mobilePushTokenRepositoryMock.update.mockReset();
    tokenServiceMock.assertAuthorized.mockClear();
    tokenServiceMock.assertTokenAuthorized.mockClear();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EventsModule, MapModule, StatsModule],
    })
      .overrideProvider(getRepositoryToken(RawEventEntity))
      .useValue(rawRepositoryMock)
      .overrideProvider(getRepositoryToken(ParsedEventEntity))
      .useValue(parsedRepositoryMock)
      .overrideProvider(getRepositoryToken(MapPushSubscriptionEntity))
      .useValue(mapPushSubscriptionsRepositoryMock)
      .overrideProvider(getRepositoryToken(MobilePushTokenEntity))
      .useValue(mobilePushTokenRepositoryMock)
      .overrideProvider(getRepositoryToken(MobileUserEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(ReferralEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(ReferralCodeEntity))
      .useValue({})
      .overrideProvider(DeviceTokenService)
      .useValue(tokenServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(
      (
        req: Request & { requestId?: string },
        _res: Response,
        next: NextFunction,
      ) => {
        req.requestId = "req-map-test";
        next();
      },
    );
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

  it("returns mapped events with expected response shape", async () => {
    parsedRepositoryMock.query.mockResolvedValueOnce([
      {
        id: "parsed-1",
        event_type: "control",
        location_text: "Bulevar Nemanjica",
        sender_name: null,
        description: "Kod Delte",
        confidence: 0.84,
        event_time: "2026-03-12T22:25:00.000Z",
        created_at: "2026-03-12T22:20:00.000Z",
        expires_at: "2026-03-13T00:20:00.000Z",
        latitude: 43.3237,
        longitude: 21.896,
        geo_source: "fallback",
        upvotes: 2,
        downvotes: 0,
        raw_message: "bulevar duvaljka",
      },
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/events/map")
      .set("Authorization", "Bearer dev-token-01")
      .expect(200);

    expect(response.body).toEqual([
      {
        id: "parsed-1",
        eventType: "control",
        locationText: "Bulevar Nemanjica",
        senderName: null,
        description: "Kod Delte",
        confidence: 0.84,
        eventTime: "2026-03-12T22:25:00.000Z",
        createdAt: "2026-03-12T22:20:00.000Z",
        expiresAt: "2026-03-13T00:20:00.000Z",
        lat: 43.3237,
        lng: 21.896,
        geoSource: "fallback",
        upvotes: 2,
        downvotes: 0,
        rawMessage: "bulevar duvaljka",
      },
    ]);

    expect(parsedRepositoryMock.query).toHaveBeenCalledTimes(1);
    const params = parsedRepositoryMock.query.mock.calls[0][1];
    expect(params[0]).toEqual(expect.any(String));
    expect(params[1]).toEqual([]);
    expect(params[2]).toBe(true);
  });

  it("parses query params since, eventType and geoOnly", async () => {
    parsedRepositoryMock.query.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get(
        "/api/events/map?since=2026-03-10T00:00:00.000Z&eventType=control,police&geoOnly=false",
      )
      .set("Authorization", "Bearer dev-token-01")
      .expect(200);

    const params = parsedRepositoryMock.query.mock.calls[0][1];
    expect(params[0]).toBe("2026-03-10T00:00:00.000Z");
    expect(params[1]).toEqual(["control", "police"]);
    expect(params[2]).toBe(false);
  });

  it("returns 401 for invalid token", async () => {
    await request(app.getHttpServer())
      .get("/api/events/map")
      .set("Authorization", "Bearer wrong-token")
      .expect(401);
  });

  it("returns public map reports without auth and without rawMessage", async () => {
    parsedRepositoryMock.query.mockResolvedValueOnce([
      {
        id: "parsed-2",
        event_type: "police",
        location_text: "Centar",
        sender_name: "Pera",
        description: "Punkt",
        confidence: "0.72",
        event_time: "2026-03-13T08:10:00.000Z",
        created_at: "2026-03-13T08:05:00.000Z",
        expires_at: "2026-03-13T10:05:00.000Z",
        latitude: 43.3201,
        longitude: 21.9002,
        geo_source: "nominatim",
        upvotes: 0,
        downvotes: 0,
      },
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/map/reports?geoOnly=false")
      .expect(200);

    expect(response.body).toEqual([
      {
        id: "parsed-2",
        eventType: "police",
        locationText: "Centar",
        senderName: "Pera",
        description: "Punkt",
        confidence: 0.72,
        eventTime: "2026-03-13T08:10:00.000Z",
        createdAt: "2026-03-13T08:05:00.000Z",
        expiresAt: "2026-03-13T10:05:00.000Z",
        lat: 43.3201,
        lng: 21.9002,
        geoSource: "nominatim",
        upvotes: 0,
        downvotes: 0,
      },
    ]);
  });

  it("returns one public report by id", async () => {
    parsedRepositoryMock.query.mockResolvedValueOnce([
      {
        id: "d067273a-8fd6-4ab5-b24d-3f2f4f54f241",
        event_type: "police",
        location_text: "Centar",
        sender_name: "Pera",
        description: "Punkt",
        confidence: "0.72",
        event_time: "2026-03-13T08:10:00.000Z",
        created_at: "2026-03-13T08:05:00.000Z",
        expires_at: "2026-03-13T10:05:00.000Z",
        latitude: 43.3201,
        longitude: 21.9002,
        geo_source: "nominatim",
        upvotes: 0,
        downvotes: 0,
      },
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/map/reports/d067273a-8fd6-4ab5-b24d-3f2f4f54f241")
      .expect(200);

    expect(response.body).toEqual({
      id: "d067273a-8fd6-4ab5-b24d-3f2f4f54f241",
      eventType: "police",
      locationText: "Centar",
      senderName: "Pera",
      description: "Punkt",
      confidence: 0.72,
      eventTime: "2026-03-13T08:10:00.000Z",
      createdAt: "2026-03-13T08:05:00.000Z",
      expiresAt: "2026-03-13T10:05:00.000Z",
      lat: 43.3201,
      lng: 21.9002,
      geoSource: "nominatim",
      upvotes: 0,
      downvotes: 0,
    });
  });

  it("returns 400 for invalid report id format", async () => {
    await request(app.getHttpServer()).get("/api/map/reports/not-a-uuid").expect(400);
  });

  it("returns 404 for unknown report id", async () => {
    parsedRepositoryMock.query.mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .get("/api/map/reports/d067273a-8fd6-4ab5-b24d-3f2f4f54f241")
      .expect(404);
  });

  it("accepts one vote per report and returns updated counters", async () => {
    parsedRepositoryMock.query
      .mockResolvedValueOnce([{ id: "parsed-2" }])
      .mockResolvedValueOnce([{ id: "vote-1" }])
      .mockResolvedValueOnce([
        {
          id: "parsed-2",
          upvotes: 1,
          downvotes: 0,
        },
      ]);

    const response = await request(app.getHttpServer())
      .post("/api/map/reports/parsed-2/vote")
      .send({ vote: "up" })
      .expect(201);

    expect(response.body).toEqual({
      id: "parsed-2",
      upvotes: 1,
      downvotes: 0,
    });
  });

  it("rate limits repeated vote from same client for one report", async () => {
    parsedRepositoryMock.query
      .mockResolvedValueOnce([{ id: "parsed-2" }])
      .mockResolvedValueOnce([]);

    await request(app.getHttpServer())
      .post("/api/map/reports/parsed-2/vote")
      .send({ vote: "down" })
      .expect(429);
  });

  it("returns public statistics payload", async () => {
    parsedRepositoryMock.query
      .mockResolvedValueOnce([
        {
          total_reports_today: 7,
          total_reports_week: 32,
          busiest_area: "Bulevar Nemanjica",
          most_common_type: "police",
          peak_hour: "17:00",
        },
      ])
      .mockResolvedValueOnce([
        { type: "police", count: 10 },
        { type: "radar", count: 8 },
      ])
      .mockResolvedValueOnce([
        { hour: 8, count: 3 },
        { hour: 17, count: 6 },
      ]);

    const response = await request(app.getHttpServer())
      .get("/api/stats/public")
      .expect(200);

    expect(response.body).toEqual({
      total_reports_today: 7,
      total_reports_week: 32,
      busiest_area: "Bulevar Nemanjica",
      most_common_type: "police",
      peak_hour: "17:00",
      reports_by_type: [
        { type: "police", count: 10 },
        { type: "radar", count: 8 },
      ],
      reports_by_hour: [
        { hour: 8, count: 3 },
        { hour: 17, count: 6 },
      ],
    });
  });
});
