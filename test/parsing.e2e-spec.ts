import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AppLogger } from "../src/common/app.logger";
import { ParsedEventEntity } from "../src/database/parsed-event.entity";
import { ParsingService } from "../src/parsing/parsing.service";
import { ParsingContext, ParsingResult } from "../src/parsing/types";

describe("ParsingService", () => {
  let service: ParsingService;

  const parsedEventsRepositoryMock = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        PARSER_VERSION: "v1.0",
      };
      return values[key];
    }),
  };

  const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    parsedEventsRepositoryMock.findOne.mockReset();
    parsedEventsRepositoryMock.create.mockReset();
    parsedEventsRepositoryMock.save.mockReset();
    parsedEventsRepositoryMock.update.mockReset();
    configServiceMock.get.mockClear();
    loggerMock.info.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParsingService,
        {
          provide: getRepositoryToken(ParsedEventEntity),
          useValue: parsedEventsRepositoryMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: AppLogger,
          useValue: loggerMock,
        },
      ],
    }).compile();

    service = module.get<ParsingService>(ParsingService);
  });

  describe("parseRawMessage", () => {
    it("returns parsed + pending for readable text", async () => {
      const context: ParsingContext = {
        rawMessage: "Marko kod Delte 09:12",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.status).toBe("parsed");
      expect(result.eventType).toBe("unknown");
      expect(result.locationText).toBeNull();
      expect(result.senderName).toBeNull();
      expect(result.enrichStatus).toBe("pending");
      expect(result.confidence).toBe(0);
    });

    it("returns no_match for unreadable short text", async () => {
      const context: ParsingContext = {
        rawMessage: "9:",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.status).toBe("no_match");
      expect(result.enrichStatus).toBeNull();
      expect(result.eventTime).toBeNull();
    });

    it("returns no_match for noisy text with low letter ratio", async () => {
      const context: ParsingContext = {
        rawMessage: "12:34 !!! @@@",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.status).toBe("no_match");
      expect(result.enrichStatus).toBeNull();
      expect(result.eventType).toBe("unknown");
    });

    it("extracts HH:MM time with leading zero", async () => {
      const result = await service.parseRawMessage({
        rawMessage: "Mika kod Granda 09:12",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      });

      expect(result.status).toBe("parsed");
      expect(result.eventTime).not.toBeNull();
      expect(result.eventTime?.getHours()).toBe(9);
      expect(result.eventTime?.getMinutes()).toBe(12);
    });

    it("extracts HH:MM time without leading zero", async () => {
      const result = await service.parseRawMessage({
        rawMessage: "Mika kod Granda 7:05",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      });

      expect(result.status).toBe("parsed");
      expect(result.eventTime).not.toBeNull();
      expect(result.eventTime?.getHours()).toBe(7);
      expect(result.eventTime?.getMinutes()).toBe(5);
    });

    it("returns parsed with null time when HH:MM is missing", async () => {
      const result = await service.parseRawMessage({
        rawMessage: "Mika kod Granda bez vremena",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      });

      expect(result.status).toBe("parsed");
      expect(result.eventTime).toBeNull();
      expect(result.enrichStatus).toBe("pending");
    });
  });

  describe("persistParsed", () => {
    it("inserts new parsed event", async () => {
      const parseResult: ParsingResult = {
        status: "parsed",
        eventType: "unknown",
        locationText: null,
        senderName: null,
        description: null,
        eventTime: null,
        confidence: 0,
        enrichStatus: "pending",
      };

      const mockEntity = {
        id: "parsed-uuid-1",
        rawEventId: "raw-uuid-1",
        parseStatus: "parsed",
        eventType: "unknown",
        locationText: null,
        senderName: null,
        description: null,
        eventTime: null,
        confidence: 0,
        enrichStatus: "pending",
        enrichedAt: null,
        parserVersion: "v1.0",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      parsedEventsRepositoryMock.findOne.mockResolvedValueOnce(null);
      parsedEventsRepositoryMock.create.mockReturnValueOnce(mockEntity);
      parsedEventsRepositoryMock.save.mockResolvedValueOnce(mockEntity);

      const result = await service.persistParsed("raw-uuid-1", parseResult);

      expect(result.id).toBe("parsed-uuid-1");
      expect(result.rawEventId).toBe("raw-uuid-1");
      expect(result.parseStatus).toBe("parsed");
      expect(result.eventType).toBe("unknown");
      expect(result.enrichStatus).toBe("pending");
      expect(parsedEventsRepositoryMock.create).toHaveBeenCalled();
      expect(parsedEventsRepositoryMock.save).toHaveBeenCalled();
    });

    it("updates existing parsed event (upsert)", async () => {
      const parseResult: ParsingResult = {
        status: "parsed",
        eventType: "unknown",
        locationText: null,
        senderName: null,
        description: null,
        eventTime: null,
        confidence: 0,
        enrichStatus: "pending",
      };

      const existingEntity = {
        id: "parsed-uuid-1",
        rawEventId: "raw-uuid-1",
        parseStatus: "no_match",
      };

      const updatedEntity = {
        id: "parsed-uuid-1",
        rawEventId: "raw-uuid-1",
        parseStatus: "parsed",
        eventType: "unknown",
        locationText: null,
        senderName: null,
        description: null,
        eventTime: null,
        confidence: 0,
        enrichStatus: "pending",
        enrichedAt: null,
        parserVersion: "v1.0",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      parsedEventsRepositoryMock.findOne
        .mockResolvedValueOnce(existingEntity)
        .mockResolvedValueOnce(updatedEntity);
      parsedEventsRepositoryMock.update.mockResolvedValueOnce({ affected: 1 });

      const result = await service.persistParsed("raw-uuid-1", parseResult);

      expect(result.id).toBe("parsed-uuid-1");
      expect(result.parseStatus).toBe("parsed");
      expect(result.enrichStatus).toBe("pending");
      expect(parsedEventsRepositoryMock.update).toHaveBeenCalled();
    });
  });
});
