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
