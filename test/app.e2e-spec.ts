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

describe("Viber Events (e2e)", () => {
  let app: INestApplication;

  const repositoryMock = {
    create: jest.fn((value) => value),
    save: jest.fn(),
  };

  const parsedRepositoryMock = {
    query: jest.fn(),
  };

  const tokenServiceMock = {
    assertAuthorized: jest.fn((deviceId: string, token: string) => {
      if (deviceId === "android_listener_01" && token === "dev-token-01") {
        return;
      }
      throw new UnauthorizedException();
    }),
    assertTokenAuthorized: jest.fn((token: string) => {
      if (token === "dev-token-01") {
        return;
      }
      throw new UnauthorizedException();
    }),
  };

  beforeEach(async () => {
    repositoryMock.create.mockClear();
    repositoryMock.save.mockReset();
    parsedRepositoryMock.query.mockReset();
    tokenServiceMock.assertAuthorized.mockClear();
    tokenServiceMock.assertTokenAuthorized.mockClear();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EventsModule],
    })
      .overrideProvider(getRepositoryToken(RawEventEntity))
      .useValue(repositoryMock)
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
        req.requestId = "req-test-1";
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

  const validPayload = {
    source: "viber_listener_android",
    group: "Radar Nis",
    message: "Policija kod Delte",
    timestamp: "2026-03-09T14:22:00Z",
    device_id: "android_listener_01",
  };

  it("returns 200 and stores row for valid payload", async () => {
    repositoryMock.save.mockResolvedValueOnce({ id: "1" });

    const response = await request(app.getHttpServer())
      .post("/api/events/viber")
      .set("Authorization", "Bearer dev-token-01")
      .send(validPayload)
      .expect(200);

    expect(response.body).toEqual({
      status: "accepted",
      request_id: "req-test-1",
    });
    expect(repositoryMock.save).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for missing required field", async () => {
    const payload = { ...validPayload } as Record<string, string>;
    delete payload.group;

    const response = await request(app.getHttpServer())
      .post("/api/events/viber")
      .set("Authorization", "Bearer dev-token-01")
      .send(payload)
      .expect(400);

    expect(response.body.error.code).toBe("INVALID_PAYLOAD");
    expect(response.body.error.request_id).toBe("req-test-1");
  });

  it("returns 401 for invalid token", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/events/viber")
      .set("Authorization", "Bearer wrong-token")
      .send(validPayload)
      .expect(401);

    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 429 with deterministic error schema when forced", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/events/viber")
      .set("Authorization", "Bearer dev-token-01")
      .set("x-radar-force-429", "1")
      .send(validPayload)
      .expect(429);

    expect(response.body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Rate limited",
        request_id: "req-test-1",
      },
    });
  });

  it("returns 500 when repository save fails", async () => {
    repositoryMock.save.mockRejectedValueOnce(new Error("db down"));

    const response = await request(app.getHttpServer())
      .post("/api/events/viber")
      .set("Authorization", "Bearer dev-token-01")
      .send(validPayload)
      .expect(500);

    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server failure",
        request_id: "req-test-1",
      },
    });
  });

  it("handles 100 requests in 10s without crashes", async () => {
    repositoryMock.save.mockResolvedValue({ id: "1" });

    const responses: Array<{ status: number }> = [];
    for (let index = 0; index < 100; index += 1) {
      const response = await request(app.getHttpServer())
        .post("/api/events/viber")
        .set("Authorization", "Bearer dev-token-01")
        .send(validPayload);
      responses.push(response);
    }

    const serverFailures = responses.filter(
      (response) => response.status >= 500,
    );
    expect(serverFailures).toHaveLength(0);
    expect(responses).toHaveLength(100);
  });
});
