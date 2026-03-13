import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EnrichmentService } from "../src/enrichment/enrichment.service";
import { GeocodingService } from "../src/geocoding/geocoding.service";
import { ParsedEventEntity } from "../src/database/parsed-event.entity";
import { AppLogger } from "../src/common/app.logger";

describe("EnrichmentService (e2e)", () => {
  let enrichmentService: EnrichmentService;
  let parsedEventsRepository: Repository<ParsedEventEntity>;

  const repositoryMock = {
    query: jest.fn(),
  };

  const configValues: Record<string, string | undefined> = {
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL: "gpt-5-mini",
    ENRICHMENT_POLL_INTERVAL_MS: "10000",
    ENRICHMENT_BATCH_SIZE: "10",
    ENRICHMENT_MAX_ATTEMPTS: "3",
    ENRICHMENT_RETRY_COOLDOWN_MS: "60000",
    NOMINATIM_USER_AGENT: "radar-puls-api/1.0 (contact: test@local)",
    GEO_ENABLED: "true",
  };

  const geocodingServiceMock = {
    geocodeLocation: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => configValues[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = configValues[key];
      if (!value) {
        throw new Error(`missing config: ${key}`);
      }
      return value;
    }),
  };

  const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    repositoryMock.query.mockReset();
    configServiceMock.get.mockClear();
    configServiceMock.getOrThrow.mockClear();
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
    geocodingServiceMock.geocodeLocation.mockReset();
    geocodingServiceMock.geocodeLocation.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrichmentService,
        {
          provide: getRepositoryToken(ParsedEventEntity),
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
          provide: GeocodingService,
          useValue: geocodingServiceMock,
        },
      ],
    }).compile();

    enrichmentService = module.get<EnrichmentService>(EnrichmentService);
    parsedEventsRepository = module.get<Repository<ParsedEventEntity>>(
      getRepositoryToken(ParsedEventEntity),
    );
  });

  it("enriches pending records and marks them enriched", async () => {
    (parsedEventsRepository.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "parsed-1",
          raw_event_id: "raw-1",
          raw_message: "Marko Bulevar Nemanjica 09:12",
          enrich_attempts: 0,
        },
      ])
      .mockResolvedValueOnce([[], 1]);

    jest
      .spyOn(enrichmentService as any, "extractStructuredData")
      .mockResolvedValue({
        senderName: "Marko",
        locationText: "Bulevar Nemanjica",
        eventType: "radar",
      });
    geocodingServiceMock.geocodeLocation.mockResolvedValueOnce({
      lat: 43.3237,
      lng: 21.896,
      source: "fallback",
    });

    const result = await enrichmentService.pollAndEnrich(10);

    expect(result.claimedCount).toBe(1);
    expect(result.enrichedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    expect(parsedEventsRepository.query).toHaveBeenCalledTimes(2);
    const updateCall = (parsedEventsRepository.query as jest.Mock).mock.calls[1];
    expect(updateCall[1]).toEqual([
      "parsed-1",
      "Marko",
      "Bulevar Nemanjica",
      "radar",
      43.3237,
      21.896,
      "fallback",
    ]);
  });

  it("schedules retry after first failure", async () => {
    const before = Date.now();

    (parsedEventsRepository.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "p-1",
          raw_event_id: "r-1",
          raw_message: "neka poruka",
          enrich_attempts: 0,
        },
      ])
      .mockResolvedValueOnce([[], 1]);

    jest
      .spyOn(enrichmentService as any, "extractStructuredData")
      .mockRejectedValue(new Error("openai down"));

    const result = await enrichmentService.pollAndEnrich(10);

    expect(result.failedCount).toBe(1);

    const updateCall = (parsedEventsRepository.query as jest.Mock).mock.calls[1];
    const params = updateCall[1] as [string, number, Date];

    expect(params[0]).toBe("p-1");
    expect(params[1]).toBe(1);
    expect(params[2]).toBeInstanceOf(Date);
    expect(params[2].getTime()).toBeGreaterThan(before);
  });

  it("keeps current event type when AI does not return it", async () => {
    (parsedEventsRepository.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "parsed-3",
          raw_event_id: "raw-3",
          raw_message: "Petar kod Delte",
          enrich_attempts: 0,
        },
      ])
      .mockResolvedValueOnce([[], 1]);

    jest
      .spyOn(enrichmentService as any, "extractStructuredData")
      .mockResolvedValue({
        senderName: "Petar",
        locationText: "Delta",
      });
    geocodingServiceMock.geocodeLocation.mockResolvedValueOnce(null);

    await enrichmentService.pollAndEnrich(10);

    const updateCall = (parsedEventsRepository.query as jest.Mock).mock.calls[1];
    expect(updateCall[1]).toEqual([
      "parsed-3",
      "Petar",
      "Delta",
      null,
      null,
      null,
      null,
    ]);
  });

  it("schedules longer cooldown on second failure (exponential backoff)", async () => {
    (parsedEventsRepository.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "p-2",
          raw_event_id: "r-2",
          raw_message: "neka poruka",
          enrich_attempts: 1,
        },
      ])
      .mockResolvedValueOnce([[], 1]);

    jest
      .spyOn(enrichmentService as any, "extractStructuredData")
      .mockRejectedValue(new Error("openai down"));

    const before = Date.now();
    await enrichmentService.pollAndEnrich(10);

    const params = (parsedEventsRepository.query as jest.Mock).mock.calls[1][1] as [
      string,
      number,
      Date,
    ];
    expect(params[1]).toBe(2);
    expect(params[2].getTime()).toBeGreaterThanOrEqual(before + 100_000);
  });

  it("permanently fails record after maxAttempts exhausted", async () => {
    (parsedEventsRepository.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "p-3",
          raw_event_id: "r-3",
          raw_message: "neka poruka",
          enrich_attempts: 2,
        },
      ])
      .mockResolvedValueOnce([[], 1]);

    jest
      .spyOn(enrichmentService as any, "extractStructuredData")
      .mockRejectedValue(new Error("openai down"));

    await enrichmentService.pollAndEnrich(10);

    const updateSql = (parsedEventsRepository.query as jest.Mock).mock.calls[1][0] as string;
    const params = (parsedEventsRepository.query as jest.Mock).mock.calls[1][1] as unknown[];

    expect(updateSql).toContain("enrich_status = 'failed'");
    expect(params[0]).toBe("p-3");
    expect(params[1]).toBe(3);
    expect(params[2]).toBeNull();
  });

  it("enriches successfully on retry attempt", async () => {
    (parsedEventsRepository.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "p-4",
          raw_event_id: "r-4",
          raw_message: "Petar bulevar",
          enrich_attempts: 1,
        },
      ])
      .mockResolvedValueOnce([[], 1]);

    jest
      .spyOn(enrichmentService as any, "extractStructuredData")
      .mockResolvedValue({
        senderName: "Petar",
        locationText: "Bulevar Nemanjica",
        eventType: "radar",
      });
    geocodingServiceMock.geocodeLocation.mockResolvedValueOnce(null);

    const result = await enrichmentService.pollAndEnrich(10);

    expect(result.enrichedCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it("findPending query filters by enrich_next_retry_at", async () => {
    (parsedEventsRepository.query as jest.Mock).mockResolvedValueOnce([]);

    await enrichmentService.pollAndEnrich(10);

    const sql = (parsedEventsRepository.query as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain("enrich_next_retry_at");
  });
});
