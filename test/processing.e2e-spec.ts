import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import { NextFunction, Request, Response } from "express";
import { AppLogger } from "../src/common/app.logger";
import { RawEventEntity } from "../src/database/raw-event.entity";
import { ProcessingController } from "../src/processing/processing.controller";
import { ProcessingDevGuard } from "../src/processing/processing-dev.guard";
import { ProcessingService } from "../src/processing/processing.service";
import { ParsingService } from "../src/parsing/parsing.service";
import { ParsingResult } from "../src/parsing/types";

describe("Processing (e2e)", () => {
  let app: INestApplication;

  const repositoryMock = {
    query: jest.fn(),
  };

  const configValues: Record<string, string | undefined> = {
    NODE_ENV: "development",
    ENABLE_DEV_PROCESSING_TRIGGER: "true",
    PROCESSING_DEV_TRIGGER_TOKEN: "dev-trigger-token",
  };

  const configServiceMock = {
    get: jest.fn((key: string) => configValues[key]),
  };

  const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const parsingServiceMock = {
    parseRawMessage: jest.fn(),
    persistParsed: jest.fn(),
  };

  beforeEach(async () => {
    repositoryMock.query.mockReset();
    configServiceMock.get.mockClear();
    configValues.NODE_ENV = "development";
    configValues.ENABLE_DEV_PROCESSING_TRIGGER = "true";
    configValues.PROCESSING_DEV_TRIGGER_TOKEN = "dev-trigger-token";

    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();

    parsingServiceMock.parseRawMessage.mockClear();
    parsingServiceMock.persistParsed.mockClear();
    // Default mock return value for parser
    parsingServiceMock.parseRawMessage.mockResolvedValue({
      status: "parsed",
      eventType: "police",
      locationText: "Test Location",
      description: "Test Description",
      eventTime: null,
      confidence: 0.8,
    } as ParsingResult);
    parsingServiceMock.persistParsed.mockResolvedValue({
      id: "parsed-uuid",
      rawEventId: "event-uuid",
      parseStatus: "parsed",
      eventType: "police",
      locationText: "Test Location",
      description: "Test Description",
      eventTime: null,
      confidence: 0.8,
      parserVersion: "v1.0",
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProcessingController],
      providers: [
        ProcessingDevGuard,
        ProcessingService,
        {
          provide: getRepositoryToken(RawEventEntity),
          useValue: repositoryMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: AppLogger,
          useValue: loggerMock,
        },
        {
          provide: ParsingService,
          useValue: parsingServiceMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(
      (
        req: Request & { requestId?: string },
        _res: Response,
        next: NextFunction,
      ) => {
        req.requestId = "req-processing-test";
        next();
      },
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("runs one processing batch from dev trigger", async () => {
    repositoryMock.query
      .mockResolvedValueOnce([
        [{ id: "event-1", raw_message: "normal event" }],
        1,
      ])
      .mockResolvedValueOnce([[{ id: "event-1" }], 1]);

    const response = await request(app.getHttpServer())
      .post("/api/processing/dev/run-once")
      .set("Authorization", "Bearer dev-trigger-token")
      .expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.request_id).toBe("req-processing-test");
    expect(response.body.claimed_count).toBe(1);
    expect(response.body.processed_count).toBe(1);
    expect(response.body.failed_count).toBe(0);
    expect(typeof response.body.duration_ms).toBe("number");
  });

  it("returns 404 when dev trigger is disabled", async () => {
    configValues.ENABLE_DEV_PROCESSING_TRIGGER = "false";

    await request(app.getHttpServer())
      .post("/api/processing/dev/run-once")
      .set("Authorization", "Bearer dev-trigger-token")
      .expect(404);
  });

  it("returns 401 for wrong dev trigger token", async () => {
    await request(app.getHttpServer())
      .post("/api/processing/dev/run-once")
      .set("Authorization", "Bearer wrong-token")
      .expect(401);
  });

  it("retries failed processing with backoff", async () => {
    repositoryMock.query
      .mockResolvedValueOnce([
        [{ id: "event-2", raw_message: "[fail-processing] force" }],
        1,
      ])
      .mockResolvedValueOnce([{ retry_count: 0 }])
      .mockResolvedValueOnce([[], 0]);

    const response = await request(app.getHttpServer())
      .post("/api/processing/dev/run-once")
      .set("Authorization", "Bearer dev-trigger-token")
      .expect(200);

    expect(response.body.claimed_count).toBe(1);
    expect(response.body.processed_count).toBe(0);
    expect(response.body.failed_count).toBe(1);

    expect(repositoryMock.query).toHaveBeenCalledTimes(3);
  });
});
