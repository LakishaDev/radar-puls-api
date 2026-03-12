import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BackfillService } from "../src/processing/backfill.service";
import { ParsingService } from "../src/parsing/parsing.service";
import { RawEventEntity } from "../src/database/raw-event.entity";
import { ParsedEventEntity } from "../src/database/parsed-event.entity";
import { AppLogger } from "../src/common/app.logger";

describe("BackfillService (e2e)", () => {
  let backfillService: BackfillService;
  let rawEventsRepository: Repository<RawEventEntity>;
  let parsedEventsRepository: Repository<ParsedEventEntity>;
  let parsingService: ParsingService;

  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    const mockRawEventsRepository = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      query: jest.fn(),
    };

    const mockParsedEventsRepository = {};

    const mockParsingService = {
      parseRawMessage: jest.fn(),
      persistParsed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackfillService,
        {
          provide: getRepositoryToken(RawEventEntity),
          useValue: mockRawEventsRepository,
        },
        {
          provide: getRepositoryToken(ParsedEventEntity),
          useValue: mockParsedEventsRepository,
        },
        {
          provide: ParsingService,
          useValue: mockParsingService,
        },
        {
          provide: AppLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    backfillService = module.get<BackfillService>(BackfillService);
    rawEventsRepository = module.get<Repository<RawEventEntity>>(
      getRepositoryToken(RawEventEntity),
    );
    parsedEventsRepository = module.get<Repository<ParsedEventEntity>>(
      getRepositoryToken(ParsedEventEntity),
    );
    parsingService = module.get<ParsingService>(ParsingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should backfill processed events with parsed results", async () => {
    // Mock raw events
    const mockRawEvents: Partial<RawEventEntity>[] = [
      {
        id: "raw-1",
        rawMessage: "Policija kod Bulevara Nemanjića",
        receivedAt: new Date("2026-03-12T10:00:00Z"),
        source: "viber",
        groupName: "Test Group",
        deviceId: "device-1",
        processingStatus: "processed",
      },
      {
        id: "raw-2",
        rawMessage: "Udes na putu 15:30",
        receivedAt: new Date("2026-03-12T10:05:00Z"),
        source: "viber",
        groupName: "Test Group",
        deviceId: "device-1",
        processingStatus: "processed",
      },
    ];

    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(mockRawEvents),
    };

    (rawEventsRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

    // Mock parsing results
    const mockParseResults = [
      {
        status: "parsed",
        eventType: "police",
        locationText: "Bulevara Nemanjića",
        confidence: 0.8,
      },
      {
        status: "parsed",
        eventType: "accident",
        eventTime: new Date("2026-03-12T15:30:00Z"),
        confidence: 0.75,
      },
    ];

    (parsingService.parseRawMessage as jest.Mock)
      .mockResolvedValueOnce(mockParseResults[0])
      .mockResolvedValueOnce(mockParseResults[1]);

    (parsingService.persistParsed as jest.Mock)
      .mockResolvedValueOnce({ id: "parsed-1" })
      .mockResolvedValueOnce({ id: "parsed-2" });

    // Execute backfill
    const result = await backfillService.backfillProcessedEvents({
      limit: 10,
    });

    // Verify results
    expect(result.replayed).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.duration).toBeGreaterThan(0);

    // Verify parsing was called
    expect(parsingService.parseRawMessage).toHaveBeenCalledTimes(2);
    expect(parsingService.persistParsed).toHaveBeenCalledTimes(2);

    // Verify logging
    expect(mockLogger.info).toHaveBeenCalledWith("backfill_started", expect.any(Object));
    expect(mockLogger.info).toHaveBeenCalledWith("backfill_completed", expect.any(Object));
  });

  it("should handle parsing errors gracefully", async () => {
    const mockRawEvents: Partial<RawEventEntity>[] = [
      {
        id: "raw-3",
        rawMessage: "Invalid message",
        receivedAt: new Date(),
        source: "viber",
        groupName: "Test",
        deviceId: "device-1",
        processingStatus: "processed",
      },
    ];

    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(mockRawEvents),
    };

    (rawEventsRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

    // Mock parsing failure
    (parsingService.parseRawMessage as jest.Mock).mockRejectedValueOnce(
      new Error("Parse failed"),
    );

    const result = await backfillService.backfillProcessedEvents({
      limit: 10,
    });

    expect(result.replayed).toBe(0);
    expect(result.errors).toBe(1);
    expect(mockLogger.error).toHaveBeenCalledWith("backfill_error", expect.any(Object));
  });

  it("should backfill by specific raw event IDs", async () => {
    const mockRawEvent: Partial<RawEventEntity> = {
      id: "raw-4",
      rawMessage: "Radar na putu",
      receivedAt: new Date(),
      source: "viber",
      groupName: "Test",
      deviceId: "device-1",
    };

    (rawEventsRepository.findOne as jest.Mock).mockResolvedValue(mockRawEvent);

    const mockParseResult = {
      status: "parsed",
      eventType: "radar",
      confidence: 0.7,
    };

    (parsingService.parseRawMessage as jest.Mock).mockResolvedValue(mockParseResult);
    (parsingService.persistParsed as jest.Mock).mockResolvedValue({ id: "parsed-4" });

    const result = await backfillService.backfillByRawEventIds(["raw-4"]);

    expect(result.replayed).toBe(1);
    expect(result.errors).toBe(0);
    expect(parsingService.parseRawMessage).toHaveBeenCalledTimes(1);
  });

  it("should find processed events without parsed entries", async () => {
    const mockResult = [{ count: "15" }];

    (rawEventsRepository.query as jest.Mock).mockResolvedValue(mockResult);

    const result = await backfillService.findProcessedWithoutParsed(100);

    expect(result.count).toBe(15);
    expect(mockLogger.info).toHaveBeenCalledWith("backfill_missing_parsed_found", {
      count: 15,
      limit: 100,
    });
  });

  it("should handle SQL query errors", async () => {
    (rawEventsRepository.query as jest.Mock).mockRejectedValue(
      new Error("DB connection error"),
    );

    await expect(backfillService.findProcessedWithoutParsed(100)).rejects.toThrow();
  });
});
