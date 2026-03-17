import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLogger } from "../src/common/app.logger";
import { GeocodingCacheEntity } from "../src/database/geocoding-cache.entity";
import { LocationAliasEntity } from "../src/database/location-alias.entity";
import { GeocodingService } from "../src/geocoding/geocoding.service";

describe("GeocodingService", () => {
  let service: GeocodingService;

  const configValues: Record<string, string | undefined> = {
    GOOGLE_GEOCODING_API_KEY: "test-google-key",
    GOOGLE_GEOCODING_DELAY_MS: "0",
    GEO_ENABLED: "true",
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

  const cacheRepositoryMock = {
    query: jest.fn(),
  };

  const aliasRepositoryMock = {
    find: jest.fn().mockResolvedValue([]),
    query: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    configServiceMock.get.mockClear();
    configServiceMock.getOrThrow.mockClear();
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
    cacheRepositoryMock.query.mockClear();
    aliasRepositoryMock.find.mockClear();
    aliasRepositoryMock.query.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeocodingService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: AppLogger,
          useValue: loggerMock,
        },
        {
          provide: getRepositoryToken(GeocodingCacheEntity),
          useValue: cacheRepositoryMock,
        },
        {
          provide: getRepositoryToken(LocationAliasEntity),
          useValue: aliasRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<GeocodingService>(GeocodingService);
    jest.spyOn(service as any, "sleep").mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns fallback coordinates for known phrase", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch" as any);

    const result = await service.geocodeLocation("Duvaljka kod Kalkana");

    expect(result).toEqual({
      lat: 43.3203,
      lng: 21.8958,
      source: "fallback",
      isPartialMatch: false,
      confidence: "high",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prefers specific fallback over generic phrase", async () => {
    const result = await service.geocodeLocation("Bulevar Medijana");

    expect(result).toEqual({
      lat: 43.32,
      lng: 21.91,
      source: "fallback",
      isPartialMatch: false,
      confidence: "high",
    });
  });

  it("uses Google geocoding when fallback and cache do not match", async () => {
    cacheRepositoryMock.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            formatted_address: "Ulica Nepoznata 12, Nis, Serbia",
            geometry: {
              location: { lat: 43.3178, lng: 21.9001 },
              location_type: "ROOFTOP",
            },
            partial_match: false,
            place_id: "place-1",
            types: ["street_address"],
          },
        ],
      }),
    } as Response);

    const result = await service.geocodeLocation("Ulica nepoznata 12");

    expect(result).toEqual({
      lat: 43.3178,
      lng: 21.9001,
      source: "google",
      isPartialMatch: false,
      confidence: "high",
      formattedAddress: "Ulica Nepoznata 12, Nis, Serbia",
    });
  });

  it("returns cached google partial geocode without calling fetch", async () => {
    cacheRepositoryMock.query
      .mockResolvedValueOnce([
        {
          id: "cache-id",
          lat: 43.311,
          lng: 21.901,
          is_partial: true,
          location_type: "APPROXIMATE",
          formatted_addr: "Delimicno poklapanje, Nis, Serbia",
          verified: false,
        },
      ])
      .mockResolvedValueOnce([]);

    const fetchSpy = jest.spyOn(globalThis, "fetch" as any);
    const result = await service.geocodeLocation("kod pijace");

    expect(result).toEqual({
      lat: 43.311,
      lng: 21.901,
      source: "google_partial",
      isPartialMatch: true,
      confidence: "low",
      formattedAddress: "Delimicno poklapanje, Nis, Serbia",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null on Google geocoding failure", async () => {
    cacheRepositoryMock.query.mockResolvedValueOnce([]);

    jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network timeout"));

    const result = await service.geocodeLocation("Neka random lokacija");

    expect(result).toBeNull();
  });

  it("promotes cache rows when cumulative net upvotes reach threshold", async () => {
    cacheRepositoryMock.query
      .mockResolvedValueOnce([
        { id: "cache-1", normalized_text: "kod pijace" },
        { id: "cache-2", normalized_text: "kod mosta" },
      ])
      .mockResolvedValueOnce([
        { location_text: "Kod pijace", upvotes: 3, downvotes: 0 },
        { location_text: "kod pijace", upvotes: 4, downvotes: 2 },
        { location_text: "kod mosta", upvotes: 5, downvotes: 1 },
      ])
      .mockResolvedValueOnce([{ id: "cache-1" }]);

    const promotedCount = await service.promoteVerifiedLocations();

    expect(promotedCount).toBe(1);
    expect(cacheRepositoryMock.query).toHaveBeenCalledTimes(3);
    expect(cacheRepositoryMock.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("UPDATE geocoding_cache"),
      [["cache-1"]],
    );
  });

  it("does not promote when cumulative net upvotes stay below threshold", async () => {
    cacheRepositoryMock.query
      .mockResolvedValueOnce([{ id: "cache-1", normalized_text: "kod pijace" }])
      .mockResolvedValueOnce([
        { location_text: "kod pijace", upvotes: 4, downvotes: 0 },
      ]);

    const promotedCount = await service.promoteVerifiedLocations();

    expect(promotedCount).toBe(0);
    expect(cacheRepositoryMock.query).toHaveBeenCalledTimes(2);
  });

  it("returns zero when there are no unverified cache rows", async () => {
    cacheRepositoryMock.query.mockResolvedValueOnce([]);

    const promotedCount = await service.promoteVerifiedLocations();

    expect(promotedCount).toBe(0);
    expect(cacheRepositoryMock.query).toHaveBeenCalledTimes(1);
  });
});
