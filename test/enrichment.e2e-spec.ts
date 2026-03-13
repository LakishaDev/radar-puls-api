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
    OPENAI_MODEL: "gpt-4o-mini",
    ENRICHMENT_POLL_INTERVAL_MS: "10000",
    ENRICHMENT_BATCH_SIZE: "10",
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

  it("marks record as failed when enrichment throws", async () => {
    (parsedEventsRepository.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "parsed-2",
          raw_event_id: "raw-2",
          raw_message: "Nepoznata poruka",
        },
      ])
      .mockResolvedValueOnce([[], 1]);

    jest
      .spyOn(enrichmentService as any, "extractStructuredData")
      .mockRejectedValue(new Error("openai unavailable"));

    const result = await enrichmentService.pollAndEnrich(10);

    expect(result.claimedCount).toBe(1);
    expect(result.enrichedCount).toBe(0);
    expect(result.failedCount).toBe(1);

    expect(parsedEventsRepository.query).toHaveBeenCalledTimes(2);
    const failedUpdateCall = (parsedEventsRepository.query as jest.Mock).mock.calls[1];
    expect(failedUpdateCall[1]).toEqual(["parsed-2"]);
  });

  it("keeps current event type when AI does not return it", async () => {
    (parsedEventsRepository.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "parsed-3",
          raw_event_id: "raw-3",
          raw_message: "Petar kod Delte",
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
});
