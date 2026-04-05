import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EnrichmentCacheEntity } from "../database/enrichment-cache.entity";
import { EventType } from "../parsing/types";

export type EnrichmentCachePayload = {
  eventType: EventType;
  locationText: string | null;
  confidence: number;
};

@Injectable()
export class EnrichmentCacheService {
  constructor(
    @InjectRepository(EnrichmentCacheEntity)
    private readonly cacheRepository: Repository<EnrichmentCacheEntity>,
  ) {}

  async findCached(
    normalizedText: string,
  ): Promise<EnrichmentCachePayload | null> {
    if (!normalizedText) {
      return null;
    }

    const rows = (await this.cacheRepository.query(
      `
      UPDATE enrichment_cache
      SET hit_count = hit_count + 1, updated_at = NOW()
      WHERE normalized_text = $1
      RETURNING event_type, location_text, confidence, hit_count, verified
      `,
      [normalizedText],
    )) as Array<{
      event_type: EventType;
      location_text: string | null;
      confidence: number;
      hit_count: number;
      verified: boolean;
    }>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    if (!row.verified && row.hit_count < 3) {
      return null;
    }

    return {
      eventType: row.event_type,
      locationText: row.location_text,
      confidence: Number(row.confidence),
    };
  }

  async upsertFromAI(
    normalizedText: string,
    payload: EnrichmentCachePayload,
  ): Promise<void> {
    await this.upsert(normalizedText, payload, "ai", false);
  }

  async upsertFromKeyword(
    normalizedText: string,
    payload: EnrichmentCachePayload,
  ): Promise<void> {
    await this.upsert(normalizedText, payload, "keyword", false);
  }

  async upsertFromAdmin(
    normalizedText: string,
    payload: EnrichmentCachePayload,
  ): Promise<void> {
    await this.upsert(normalizedText, payload, "admin", true);
  }

  async markVerified(id: string): Promise<void> {
    await this.cacheRepository.query(
      `
      UPDATE enrichment_cache
      SET verified = true, updated_at = NOW()
      WHERE id = $1
      `,
      [id],
    );
  }

  private async upsert(
    normalizedText: string,
    payload: EnrichmentCachePayload,
    source: "ai" | "keyword" | "admin",
    verified: boolean,
  ): Promise<void> {
    if (!normalizedText) {
      return;
    }

    await this.cacheRepository.query(
      `
      INSERT INTO enrichment_cache (
        normalized_text,
        event_type,
        location_text,
        confidence,
        hit_count,
        verified,
        source
      ) VALUES ($1, $2, $3, $4, 0, $5, $6)
      ON CONFLICT (normalized_text) DO UPDATE
      SET
        event_type = EXCLUDED.event_type,
        location_text = EXCLUDED.location_text,
        confidence = EXCLUDED.confidence,
        source = EXCLUDED.source,
        verified = enrichment_cache.verified OR EXCLUDED.verified,
        updated_at = NOW()
      `,
      [
        normalizedText,
        payload.eventType,
        payload.locationText,
        Math.round(payload.confidence),
        verified,
        source,
      ],
    );
  }
}
