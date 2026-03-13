import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLogger } from "../common/app.logger";

export type GeoSource = "fallback" | "nominatim";

export type GeoResult = {
  lat: number;
  lng: number;
  source: GeoSource;
};

type FallbackEntry = {
  phrases: string[];
  lat: number;
  lng: number;
};

type FlatFallback = {
  phrase: string;
  normalizedPhrase: string;
  lat: number;
  lng: number;
};

const LOCAL_FALLBACK_ENTRIES: FallbackEntry[] = [
  { phrases: ["kalkan", "kod kalkana"], lat: 43.3203, lng: 21.8958 },
  { phrases: ["bulevar medijana"], lat: 43.32, lng: 21.91 },
  { phrases: ["bulevar nemanjića", "bulevar"], lat: 43.3237, lng: 21.896 },
  { phrases: ["medijana"], lat: 43.318, lng: 21.915 },
  { phrases: ["palilula"], lat: 43.333, lng: 21.906 },
  { phrases: ["pantelej"], lat: 43.307, lng: 21.93 },
  { phrases: ["čair", "cair"], lat: 43.326, lng: 21.906 },
  { phrases: ["niška tvrdjava", "tvrđava", "tvrdava"], lat: 43.3215, lng: 21.9005 },
  { phrases: ["jagodička", "jagodicka"], lat: 43.33, lng: 21.912 },
  { phrases: ["vojvode tankosića", "tankosica"], lat: 43.319, lng: 21.896 },
  { phrases: ["kopitareva česma", "kopitareva"], lat: 43.315, lng: 21.891 },
  { phrases: ["niški sajam", "sajam"], lat: 43.309, lng: 21.905 },
  { phrases: ["niška banja", "banja"], lat: 43.295, lng: 22.01 },
  { phrases: ["sićevo", "sicevo"], lat: 43.36, lng: 22.07 },
  { phrases: ["leskovački put"], lat: 43.292, lng: 21.897 },
  { phrases: ["beogradski put", "beogradska"], lat: 43.338, lng: 21.888 },
  { phrases: ["brzi put", "obilaznica", "obilaznca"], lat: 43.3, lng: 21.87 },
  { phrases: ["zeleni venac"], lat: 43.3225, lng: 21.899 },
];

const FLAT_FALLBACKS: FlatFallback[] = LOCAL_FALLBACK_ENTRIES.flatMap((entry) =>
  entry.phrases.map((phrase) => ({
    phrase,
    normalizedPhrase: normalizeText(phrase),
    lat: entry.lat,
    lng: entry.lng,
  })),
).sort((a, b) => b.normalizedPhrase.length - a.normalizedPhrase.length);

@Injectable()
export class GeocodingService {
  private readonly userAgent: string;
  private readonly geoEnabled: boolean;
  private readonly nominatimDelayMs = 1100;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.userAgent = this.configService.getOrThrow<string>("NOMINATIM_USER_AGENT");
    this.geoEnabled = this.getBoolean("GEO_ENABLED", true);
  }

  async geocodeLocation(locationText: string): Promise<GeoResult | null> {
    const normalizedInput = normalizeText(locationText);
    if (!normalizedInput) {
      return null;
    }

    const fallback = this.findFallback(normalizedInput);
    if (fallback) {
      return fallback;
    }

    if (!this.geoEnabled) {
      return null;
    }

    return this.geocodeWithNominatim(locationText);
  }

  private findFallback(normalizedInput: string): GeoResult | null {
    const bestMatch = FLAT_FALLBACKS.find((entry) =>
      normalizedInput.includes(entry.normalizedPhrase),
    );

    if (!bestMatch) {
      return null;
    }

    return {
      lat: bestMatch.lat,
      lng: bestMatch.lng,
      source: "fallback",
    };
  }

  private async geocodeWithNominatim(locationText: string): Promise<GeoResult | null> {
    const params = new URLSearchParams({
      q: `${locationText}, Nis, Serbia`,
      format: "json",
      limit: "1",
      countrycodes: "rs",
      "accept-language": "sr,en",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "User-Agent": this.userAgent,
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        this.logger.warn("geocoding_nominatim_non_ok", {
          status: response.status,
        });
        return null;
      }

      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload) || payload.length === 0) {
        return null;
      }

      const first = payload[0] as { lat?: unknown; lon?: unknown };
      const lat =
        typeof first.lat === "string" ? Number.parseFloat(first.lat) : Number.NaN;
      const lng =
        typeof first.lon === "string" ? Number.parseFloat(first.lon) : Number.NaN;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      return {
        lat,
        lng,
        source: "nominatim",
      };
    } catch (error) {
      this.logger.warn("geocoding_nominatim_failed", {
        error: error instanceof Error ? error.message : "unknown geocoding error",
      });
      return null;
    } finally {
      clearTimeout(timeout);
      await this.sleep(this.nominatimDelayMs);
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key);
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }

    return fallback;
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
