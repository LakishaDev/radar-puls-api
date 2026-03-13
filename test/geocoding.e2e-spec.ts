import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLogger } from "../src/common/app.logger";
import { GeocodingService } from "../src/geocoding/geocoding.service";

describe("GeocodingService", () => {
  let service: GeocodingService;

  const configValues: Record<string, string | undefined> = {
    NOMINATIM_USER_AGENT: "radar-puls-api/1.0 (contact: test@local)",
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

  beforeEach(async () => {
    configServiceMock.get.mockClear();
    configServiceMock.getOrThrow.mockClear();
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();

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
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prefers specific fallback over generic phrase", async () => {
    const result = await service.geocodeLocation("Bulevar Medijana");

    expect(result).toEqual({
      lat: 43.32,
      lng: 21.91,
      source: "fallback",
    });
  });

  it("uses nominatim when fallback does not match", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "43.3178", lon: "21.9001" }],
    } as Response);

    const result = await service.geocodeLocation("Ulica nepoznata 12");

    expect(result).toEqual({
      lat: 43.3178,
      lng: 21.9001,
      source: "nominatim",
    });
  });

  it("returns null on nominatim failure", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network timeout"));

    const result = await service.geocodeLocation("Neka random lokacija");

    expect(result).toBeNull();
  });
});
