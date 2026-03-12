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
    it("parses police message with location", async () => {
      const context: ParsingContext = {
        rawMessage: "Policija kontrola vozača kod Delte",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.eventType).toBe("police");
      expect(result.locationText).toBe("Delte");
      expect(result.status).toBe("parsed");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("parses accident message with explicit time", async () => {
      const context: ParsingContext = {
        rawMessage: "Udes kod Bulevara Nemanjića u 14:30",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.eventType).toBe("accident");
      expect(result.locationText).toBe("Bulevara Nemanjića");
      expect(result.eventTime).not.toBeNull();
      expect(result.eventTime?.getHours()).toBe(14);
      expect(result.eventTime?.getMinutes()).toBe(30);
      expect(result.status).toBe("parsed");
    });

    it("returns no_match for incomprehensible text", async () => {
      const context: ParsingContext = {
        rawMessage: "xyzabc random text 12345 blablabla",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.status).toBe("no_match");
      expect(result.eventType).toBe("unknown");
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    it("extracts location from 'kod' keyword", async () => {
      const context: ParsingContext = {
        rawMessage: "Zastoj kod Merkurijane",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.locationText).toBe("Merkurijane");
    });

    it("handles message without location", async () => {
      const context: ParsingContext = {
        rawMessage: "Policija",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.eventType).toBe("police");
      expect(result.locationText).toBeNull();
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.status).toBe("no_match");
    });

    it("parses radar message", async () => {
      const context: ParsingContext = {
        rawMessage: "Foto radar na Bulbulskoj cesti",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.eventType).toBe("radar");
      expect(result.locationText).toBe("Bulbulskoj cesti");
      expect(result.status).toBe("parsed");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("parses traffic jam message", async () => {
      const context: ParsingContext = {
        rawMessage: "Velika gužva na Bulevaru Despota Stefana, sve sporо",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.eventType).toBe("traffic_jam");
      expect(result.locationText).toBe("Bulevaru Despota Stefana");
      expect(result.status).toBe("parsed");
    });

    it("handles message with multiple signals", async () => {
      const context: ParsingContext = {
        rawMessage: "Udes kod Fruškogorske ulice u 13:15",
        receivedAt: new Date(),
        source: "viber_listener_android",
        groupName: "Radar Nis",
        deviceId: "android_listener_01",
      };

      const result = await service.parseRawMessage(context);

      expect(result.eventType).toBe("accident");
      expect(result.locationText).toBe("Fruškogorske ulice");
      expect(result.eventTime?.getHours()).toBe(13);
      expect(result.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD_WITH_MULTIPLE_SIGNALS);
      expect(result.status).toBe("parsed");
    });

    it("maintains confidence between 0 and 1", async () => {
      const contexts: ParsingContext[] = [
        {
          rawMessage: "Policija, udes, gužva rad",
          receivedAt: new Date(),
          source: "viber_listener_android",
          groupName: "Radar Nis",
          deviceId: "android_listener_01",
        },
        {
          rawMessage: "xyzabc",
          receivedAt: new Date(),
          source: "viber_listener_android",
          groupName: "Radar Nis",
          deviceId: "android_listener_01",
        },
      ];

      for (const context of contexts) {
        const result = await service.parseRawMessage(context);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("persistParsed", () => {
    it("inserts new parsed event", async () => {
      const parseResult: ParsingResult = {
        status: "parsed",
        eventType: "police",
        locationText: "Delta",
        description: "Police in Delta",
        eventTime: null,
        confidence: 0.7,
      };

      const mockEntity = {
        id: "parsed-uuid-1",
        rawEventId: "raw-uuid-1",
        parseStatus: "parsed",
        eventType: "police",
        locationText: "Delta",
        description: "Police in Delta",
        eventTime: null,
        confidence: 0.7,
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
      expect(result.eventType).toBe("police");
      expect(parsedEventsRepositoryMock.create).toHaveBeenCalled();
      expect(parsedEventsRepositoryMock.save).toHaveBeenCalled();
    });

    it("updates existing parsed event (upsert)", async () => {
      const parseResult: ParsingResult = {
        status: "parsed",
        eventType: "accident",
        locationText: "New Location",
        description: "Updated description",
        eventTime: null,
        confidence: 0.85,
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
        eventType: "accident",
        locationText: "New Location",
        description: "Updated description",
        eventTime: null,
        confidence: 0.85,
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
      expect(parsedEventsRepositoryMock.update).toHaveBeenCalled();
    });
  });
});

// Test constant
const CONFIDENCE_THRESHOLD_WITH_MULTIPLE_SIGNALS = 0.5;
