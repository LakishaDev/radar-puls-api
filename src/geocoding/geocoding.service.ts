import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { GeocodingCacheEntity } from "../database/geocoding-cache.entity";

export type GeoSource =
  | "fallback"
  | "cache"
  | "google"
  | "google_partial"
  | "nominatim";

export type GeoConfidence = "high" | "medium" | "low";

export type GeoResult = {
  lat: number;
  lng: number;
  source: GeoSource;
  isPartialMatch: boolean;
  confidence: GeoConfidence;
  formattedAddress?: string;
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

type GoogleGeoResponseStatus =
  | "OK"
  | "ZERO_RESULTS"
  | "OVER_QUERY_LIMIT"
  | "REQUEST_DENIED"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

type GoogleLocationType =
  | "ROOFTOP"
  | "RANGE_INTERPOLATED"
  | "GEOMETRIC_CENTER"
  | "APPROXIMATE";

type GoogleGeoResponse = {
  status: GoogleGeoResponseStatus;
  results: Array<{
    formatted_address: string;
    geometry: {
      location: { lat: number; lng: number };
      location_type: GoogleLocationType;
    };
    partial_match?: boolean;
    place_id: string;
    types: string[];
  }>;
  error_message?: string;
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
  private readonly apiKey: string;
  private readonly geoEnabled: boolean;
  private readonly googleDelayMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    @InjectRepository(GeocodingCacheEntity)
    private readonly cacheRepository: Repository<GeocodingCacheEntity>,
  ) {
    this.apiKey = this.configService.getOrThrow<string>("GOOGLE_GEOCODING_API_KEY");
    this.geoEnabled = this.getBoolean("GEO_ENABLED", true);
    this.googleDelayMs = Number(this.configService.get("GOOGLE_GEOCODING_DELAY_MS") ?? 0);
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

    const cached = await this.findCached(normalizedInput);
    if (cached) {
      return cached;
    }

    return this.geocodeWithGoogle(locationText, normalizedInput);
  }

  async promoteVerifiedLocations(): Promise<number> {
    const unverifiedRows = (await this.cacheRepository.query(
      `
      SELECT id, normalized_text
      FROM geocoding_cache
      WHERE verified = false
      `,
    )) as Array<{ id: string; normalized_text: string }>;

    if (unverifiedRows.length === 0) {
      return 0;
    }

    const parsedRows = (await this.cacheRepository.query(
      `
      SELECT location_text, upvotes, downvotes
      FROM parsed_events
      WHERE location_text IS NOT NULL
      `,
    )) as Array<{ location_text: string; upvotes: number; downvotes: number }>;

    const scores = new Map<string, number>();
    for (const row of parsedRows) {
      const normalized = normalizeText(row.location_text);
      if (!normalized) {
        continue;
      }

      const delta = Number(row.upvotes) - Number(row.downvotes);
      scores.set(normalized, (scores.get(normalized) ?? 0) + delta);
    }

    const idsToPromote = unverifiedRows
      .filter((row) => (scores.get(row.normalized_text) ?? 0) >= 5)
      .map((row) => row.id);

    if (idsToPromote.length === 0) {
      return 0;
    }

    const promotedRows = (await this.cacheRepository.query(
      `
      UPDATE geocoding_cache
      SET verified = true, updated_at = NOW()
      WHERE verified = false
        AND id = ANY($1::uuid[])
      RETURNING id
      `,
      [idsToPromote],
    )) as Array<{ id: string }>;

    return promotedRows.length;
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
      isPartialMatch: false,
      confidence: "high",
    };
  }

  private async findCached(normalizedInput: string): Promise<GeoResult | null> {
    const rows = (await this.cacheRepository.query(
      `
      SELECT
        id,
        lat,
        lng,
        is_partial,
        location_type,
        formatted_addr,
        verified
      FROM geocoding_cache
      WHERE normalized_text = $1
      ORDER BY verified DESC, updated_at DESC
      LIMIT 1
      `,
      [normalizedInput],
    )) as Array<{
      id: string;
      lat: number;
      lng: number;
      is_partial: boolean;
      location_type: GoogleLocationType | null;
      formatted_addr: string | null;
      verified: boolean;
    }>;

    const cached = rows[0];
    if (!cached) {
      return null;
    }

    await this.cacheRepository.query(
      `
      UPDATE geocoding_cache
      SET hit_count = hit_count + 1, updated_at = NOW()
      WHERE id = $1
      `,
      [cached.id],
    );

    const source: GeoSource = cached.verified
      ? "cache"
      : cached.is_partial
        ? "google_partial"
        : "google";

    return {
      lat: Number(cached.lat),
      lng: Number(cached.lng),
      source,
      isPartialMatch: Boolean(cached.is_partial),
      confidence: cached.verified
        ? "high"
        : this.mapConfidence(cached.location_type, Boolean(cached.is_partial)),
      formattedAddress: cached.formatted_addr ?? undefined,
    };
  }

  private async geocodeWithGoogle(
    locationText: string,
    normalizedInput: string,
  ): Promise<GeoResult | null> {
    const params = new URLSearchParams({
      address: `${locationText}, Nis, Serbia`,
      key: this.apiKey,
      region: "rs",
      language: "sr",
      bounds: "43.25,21.80|43.40,22.00",
      components: "country:RS",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
        {
          method: "GET",
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        this.logger.warn("geocoding_google_non_ok", {
          status: response.status,
        });
        return null;
      }

      const payload = (await response.json()) as GoogleGeoResponse;
      if (payload.status === "ZERO_RESULTS") {
        return null;
      }

      if (payload.status !== "OK") {
        const metadata = {
          status: payload.status,
          error_message: payload.error_message ?? null,
        };
        if (payload.status === "REQUEST_DENIED") {
          this.logger.error("geocoding_google_request_denied", metadata);
        } else {
          this.logger.warn("geocoding_google_failed", metadata);
        }
        return null;
      }

      const first = payload.results[0];
      if (!first) {
        return null;
      }

      const lat = Number(first.geometry?.location?.lat);
      const lng = Number(first.geometry?.location?.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      const isPartialMatch = Boolean(first.partial_match);
      const locationType = first.geometry.location_type;

      await this.upsertCache({
        locationText,
        normalizedText: normalizedInput,
        lat,
        lng,
        isPartial: isPartialMatch,
        locationType,
        formattedAddr: first.formatted_address,
        placeId: first.place_id,
      });

      return {
        lat,
        lng,
        source: isPartialMatch ? "google_partial" : "google",
        isPartialMatch,
        confidence: this.mapConfidence(locationType, isPartialMatch),
        formattedAddress: first.formatted_address,
      };
    } catch (error) {
      this.logger.warn("geocoding_google_failed", {
        error: error instanceof Error ? error.message : "unknown geocoding error",
      });
      return null;
    } finally {
      clearTimeout(timeout);
      if (this.googleDelayMs > 0) {
        await this.sleep(this.googleDelayMs);
      }
    }
  }

  private async upsertCache(params: {
    locationText: string;
    normalizedText: string;
    lat: number;
    lng: number;
    isPartial: boolean;
    locationType: GoogleLocationType;
    formattedAddr: string | null;
    placeId: string | null;
  }): Promise<void> {
    await this.cacheRepository.query(
      `
      INSERT INTO geocoding_cache (
        location_text,
        normalized_text,
        lat,
        lng,
        is_partial,
        location_type,
        formatted_addr,
        place_id,
        hit_count,
        verified,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, false, NOW(), NOW())
      ON CONFLICT (normalized_text)
      DO UPDATE SET
        location_text = EXCLUDED.location_text,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        is_partial = EXCLUDED.is_partial,
        location_type = EXCLUDED.location_type,
        formatted_addr = EXCLUDED.formatted_addr,
        place_id = EXCLUDED.place_id,
        hit_count = geocoding_cache.hit_count + 1,
        updated_at = NOW()
      `,
      [
        params.locationText,
        params.normalizedText,
        params.lat,
        params.lng,
        params.isPartial,
        params.locationType,
        params.formattedAddr,
        params.placeId,
      ],
    );
  }

  private mapConfidence(
    locationType: GoogleLocationType | null,
    isPartialMatch: boolean,
  ): GeoConfidence {
    if (!locationType) {
      return isPartialMatch ? "low" : "medium";
    }

    if (isPartialMatch && locationType !== "ROOFTOP") {
      return "low";
    }

    switch (locationType) {
      case "ROOFTOP":
        return isPartialMatch ? "medium" : "high";
      case "RANGE_INTERPOLATED":
      case "GEOMETRIC_CENTER":
        return "medium";
      case "APPROXIMATE":
      default:
        return "low";
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
