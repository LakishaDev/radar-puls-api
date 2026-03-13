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
import { ParsedEventEntity } from "../src/database/parsed-event.entity";
import { RawEventEntity } from "../src/database/raw-event.entity";
import { EventsModule } from "../src/events/events.module";
import { DeviceTokenService } from "../src/auth/device-token.service";

describe("Events Map API (e2e)", () => {
  let app: INestApplication;

  const rawRepositoryMock = {
    create: jest.fn((value) => value),
    save: jest.fn(),
  };

  const parsedRepositoryMock = {
    query: jest.fn(),
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
    tokenServiceMock.assertAuthorized.mockClear();
    tokenServiceMock.assertTokenAuthorized.mockClear();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EventsModule],
    })
      .overrideProvider(getRepositoryToken(RawEventEntity))
      .useValue(rawRepositoryMock)
      .overrideProvider(getRepositoryToken(ParsedEventEntity))
      .useValue(parsedRepositoryMock)
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
        event_time: "2026-03-12T22:25:00.000Z",
        latitude: 43.3237,
        longitude: 21.896,
        geo_source: "fallback",
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
        eventTime: "2026-03-12T22:25:00.000Z",
        lat: 43.3237,
        lng: 21.896,
        geoSource: "fallback",
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
});
