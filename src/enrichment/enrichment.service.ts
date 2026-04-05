import { Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import OpenAI from "openai";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { MapEventDto } from "../events/dto/map-event.dto";
import {
  GeocodingService,
  normalizeText,
} from "../geocoding/geocoding.service";
import { EventType, ParseMethod } from "../parsing/types";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { EnrichmentCacheService } from "./enrichment-cache.service";

type PendingEnrichmentRecord = {
  id: string;
  rawEventId: string;
  rawMessage: string;
  enrichAttempts: number;
  parseMethod: ParseMethod;
  eventType: EventType;
  locationText: string | null;
  confidence: number;
  senderName: string | null;
};

type EnrichmentExtraction = {
  locationText: string | null;
  eventType: EventType;
  confidence: number;
  source: "cache" | "keyword" | "ai";
};

const ALLOWED_EVENT_TYPES: EventType[] = [
  "police",
  "accident",
  "traffic_jam",
  "radar",
  "control",
  "unknown",
];

@Injectable()
export class EnrichmentService implements OnModuleDestroy {
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly model: string;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly openai: OpenAI;

  private pollTimer: NodeJS.Timeout | null = null;
  private cycleInProgress = false;

  constructor(
    @InjectRepository(ParsedEventEntity)
    private readonly parsedEventsRepository: Repository<ParsedEventEntity>,
    private readonly geocodingService: GeocodingService,
    private readonly enrichmentCacheService: EnrichmentCacheService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    @Optional() private readonly realtimePublisher?: RealtimePublisher,
  ) {
    this.pollIntervalMs = this.getPositiveInt(
      "ENRICHMENT_POLL_INTERVAL_MS",
      10_000,
    );
    this.batchSize = this.getPositiveInt("ENRICHMENT_BATCH_SIZE", 10);
    this.model = this.configService.get<string>("OPENAI_MODEL") ?? "gpt-5-mini";
    this.maxAttempts = this.getPositiveInt("ENRICHMENT_MAX_ATTEMPTS", 3);
    this.retryBaseMs = this.getPositiveInt(
      "ENRICHMENT_RETRY_COOLDOWN_MS",
      60_000,
    );
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>("OPENAI_API_KEY"),
    });
  }

  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async startPolling(): Promise<void> {
    this.logger.info("enrichment_started", {
      batch_size: this.batchSize,
      poll_interval_ms: this.pollIntervalMs,
      model: this.model,
    });

    await this.pollAndEnrich(this.batchSize);

    this.pollTimer = setInterval(() => {
      void this.pollAndEnrich(this.batchSize);
    }, this.pollIntervalMs);
  }

  async pollAndEnrich(limit: number): Promise<{
    claimedCount: number;
    enrichedCount: number;
    failedCount: number;
  }> {
    if (this.cycleInProgress) {
      this.logger.warn("enrichment_cycle_skipped_overlap", {});
      return { claimedCount: 0, enrichedCount: 0, failedCount: 0 };
    }

    this.cycleInProgress = true;

    try {
      const pending = await this.findPending(Math.max(limit, 1));
      let enrichedCount = 0;
      let failedCount = 0;

      for (const event of pending) {
        const ok = await this.enrichEvent(event);
        if (ok) {
          enrichedCount += 1;
        } else {
          failedCount += 1;
        }
      }

      try {
        const promotedCount =
          await this.geocodingService.promoteVerifiedLocations();
        if (promotedCount > 0) {
          this.logger.info("geocoding_cache_promoted", {
            promoted_count: promotedCount,
          });
        }
      } catch (error) {
        this.logger.warn("geocoding_cache_promotion_failed", {
          error:
            error instanceof Error
              ? error.message
              : "unknown geocoding cache promotion error",
        });
      }

      this.logger.info("enrichment_batch_completed", {
        claimed_count: pending.length,
        enriched_count: enrichedCount,
        failed_count: failedCount,
      });

      return {
        claimedCount: pending.length,
        enrichedCount,
        failedCount,
      };
    } catch (error) {
      this.logger.error("enrichment_batch_failed", {
        error:
          error instanceof Error
            ? error.message
            : "unknown enrichment batch error",
      });

      return {
        claimedCount: 0,
        enrichedCount: 0,
        failedCount: 0,
      };
    } finally {
      this.cycleInProgress = false;
    }
  }

  private async findPending(limit: number): Promise<PendingEnrichmentRecord[]> {
    const rows = (await this.parsedEventsRepository.query(
      `
      SELECT pe.id, pe.raw_event_id, re.raw_message, pe.enrich_attempts
         , pe.parse_method, pe.event_type, pe.location_text, pe.confidence, pe.sender_name
      FROM parsed_events pe
      INNER JOIN raw_events re ON re.id = pe.raw_event_id
      WHERE pe.enrich_status = 'pending'
        AND (pe.enrich_next_retry_at IS NULL OR pe.enrich_next_retry_at <= NOW())
      ORDER BY pe.created_at ASC
      LIMIT $1
      `,
      [limit],
    )) as Array<{
      id: string;
      raw_event_id: string;
      raw_message: string;
      enrich_attempts: number;
      parse_method: ParseMethod;
      event_type: EventType;
      location_text: string | null;
      confidence: number;
      sender_name: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      rawEventId: row.raw_event_id,
      rawMessage: row.raw_message,
      enrichAttempts: row.enrich_attempts,
      parseMethod: row.parse_method,
      eventType: row.event_type,
      locationText: row.location_text,
      confidence: Number(row.confidence),
      senderName: row.sender_name,
    }));
  }

  private async enrichEvent(event: PendingEnrichmentRecord): Promise<boolean> {
    try {
      const normalizedRawMessage = normalizeText(event.rawMessage);
      const cached =
        await this.enrichmentCacheService.findCached(normalizedRawMessage);

      let extraction: EnrichmentExtraction;
      if (cached) {
        extraction = {
          eventType: cached.eventType,
          locationText: cached.locationText,
          confidence: cached.confidence,
          source: "cache",
        };
      } else if (
        event.parseMethod === "keyword" &&
        event.eventType !== "unknown"
      ) {
        extraction = {
          eventType: event.eventType,
          locationText: event.locationText,
          confidence: Number(event.confidence),
          source: "keyword",
        };
      } else {
        extraction = await this.extractStructuredData(event.rawMessage);
      }

      const geoResult = extraction.locationText
        ? await this.geocodingService.geocodeLocation(extraction.locationText)
        : null;

      if (normalizedRawMessage) {
        if (extraction.source === "ai") {
          await this.enrichmentCacheService.upsertFromAI(normalizedRawMessage, {
            eventType: extraction.eventType,
            locationText: extraction.locationText,
            confidence: extraction.confidence,
          });
        }
        if (extraction.source === "keyword") {
          await this.enrichmentCacheService.upsertFromKeyword(
            normalizedRawMessage,
            {
              eventType: extraction.eventType,
              locationText: extraction.locationText,
              confidence: extraction.confidence,
            },
          );
        }
      }

      await this.parsedEventsRepository.query(
        `
        UPDATE parsed_events
        SET
          sender_name = COALESCE($2, sender_name),
          location_text = $3,
          event_type = $4,
          latitude = $5,
          longitude = $6,
          geo_source = $7,
          confidence = $8,
          parse_method = CASE
            WHEN $9 = 'ai' THEN 'ai'
            WHEN $9 = 'cache' THEN 'cache'
            ELSE parse_method
          END,
          enrich_status = 'enriched',
          enriched_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          event.id,
          event.senderName,
          extraction.locationText,
          extraction.eventType,
          geoResult?.lat ?? null,
          geoResult?.lng ?? null,
          geoResult?.source ?? null,
          extraction.confidence,
          extraction.source,
        ],
      );

      const autoVerifyEnabled =
        this.configService.get<string>("GEO_AUTO_VERIFY_ENABLED") === "true";
      const minConfidence = Number(
        this.configService.get("GEO_AUTO_VERIFY_MIN_CONFIDENCE") ?? 90,
      );

      if (
        autoVerifyEnabled &&
        geoResult &&
        geoResult.source === "google" &&
        !geoResult.isPartialMatch &&
        Number(extraction.confidence ?? 0) >= minConfidence &&
        extraction.locationText
      ) {
        const normalized = normalizeText(extraction.locationText);
        if (normalized) {
          await this.geocodingService.markAsVerified(normalized);
          this.logger.info("geo_auto_verified", {
            eventId: event.id,
            locationText: extraction.locationText,
            confidence: extraction.confidence,
          });
        }
      }

      this.logger.info("enrichment_success", {
        parsed_event_id: event.id,
        raw_event_id: event.rawEventId,
        enrich_source: extraction.source,
        geo_source: geoResult?.source ?? null,
      });

      if (this.realtimePublisher) {
        const report = await this.findVisibleReportById(event.id);
        if (report) {
          this.realtimePublisher.publish({
            type: "new_report",
            reportId: report.id,
            payload: report,
          });
        }
      }

      return true;
    } catch (error) {
      const newAttempts = event.enrichAttempts + 1;
      const exhausted = newAttempts >= this.maxAttempts;

      if (exhausted) {
        await this.parsedEventsRepository.query(
          `
          UPDATE parsed_events
          SET
            enrich_status = 'failed',
            enrich_attempts = $2,
            enrich_next_retry_at = $3,
            updated_at = NOW()
          WHERE id = $1
          `,
          [event.id, newAttempts, null],
        );
      } else {
        const delayMs = Math.min(
          this.retryBaseMs * Math.pow(2, newAttempts - 1),
          3_600_000,
        );
        const retryAt = new Date(Date.now() + delayMs);

        await this.parsedEventsRepository.query(
          `
          UPDATE parsed_events
          SET
            enrich_status = 'pending',
            enrich_attempts = $2,
            enrich_next_retry_at = $3,
            updated_at = NOW()
          WHERE id = $1
          `,
          [event.id, newAttempts, retryAt],
        );
      }

      this.logger.error("enrichment_failed", {
        parsed_event_id: event.id,
        raw_event_id: event.rawEventId,
        attempt: newAttempts,
        exhausted,
        error:
          error instanceof Error ? error.message : "unknown enrichment error",
      });

      return false;
    }
  }

  private async extractStructuredData(
    rawMessage: string,
  ): Promise<EnrichmentExtraction> {
    const supportsTemperature =
      this.model.startsWith("gpt-4") || this.model.startsWith("gpt-3");
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      ...(supportsTemperature ? { temperature: 0 } : {}),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Analiziraj kratke Viber poruke o saobraćaju u Nišu.

Vrati JSON:

{
  "locationText": string|null,
  "eventType": "police"|"accident"|"traffic_jam"|"radar"|"control"|"unknown",
  "confidence": number
}

PRAVILA

eventType

control → duvaljka, alkotest, puse, zaustavljaju, kontrola  
police → murija, policija, mup, saobraćajci, patrola  
radar → radar, laser, merenje, brzina  
traffic_jam → guzva, kolona, stoji, kolaps  
accident → sudar, udes, cukanje, pao, oboren  

Ako nije jasno → "unknown".

locationText
Iz poruke izdvoji naziv mesta ili ulice za Google geocoding.

Pravila:
- Vrati samo naziv lokacije.
- Ne dodavati grad.
- Ukloni reči: kod, preko puta, ispred, iza, posle.

Primeri:
kod disa → DIS
kod delte → Delta Planet
kod stop shopa → Stop Shop
kod elektronskog → Elektronska industrija
bulevar nemanjica → Bulevar Nemanjica
knjazevacka → Knjazevacka
kod niteksa → Niteks
vojvode putnika → Vojvode Putnika

Ako nema jasne lokacije → null.

confidence
Broj 0–100 koji označava sigurnost ekstrakcije.

90–100 → jasno  
60–80 → verovatno  
30–50 → nesigurno  
<30 → vrlo nesigurno

Odgovori samo validnim JSON.`,
        },
        {
          role: "user",
          content: rawMessage,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("openai response did not contain content");
    }

    const parsed = JSON.parse(content) as {
      locationText?: unknown;
      eventType?: unknown;
      confidence?: unknown;
    };

    const locationText =
      typeof parsed.locationText === "string" &&
      parsed.locationText.trim().length > 0
        ? parsed.locationText.trim()
        : null;
    const eventType =
      typeof parsed.eventType === "string" &&
      ALLOWED_EVENT_TYPES.includes(parsed.eventType as EventType)
        ? (parsed.eventType as EventType)
        : undefined;
    const confidenceRaw =
      typeof parsed.confidence === "number"
        ? parsed.confidence
        : typeof parsed.confidence === "string"
          ? Number.parseFloat(parsed.confidence)
          : NaN;
    const confidenceNormalized = Number.isFinite(confidenceRaw)
      ? confidenceRaw <= 1
        ? confidenceRaw * 100
        : confidenceRaw
      : NaN;
    const confidence = Number.isFinite(confidenceNormalized)
      ? Number(Math.min(100, Math.max(0, confidenceNormalized)).toFixed(2))
      : 0;

    return {
      locationText,
      eventType: eventType ?? "unknown",
      confidence,
      source: "ai",
    };
  }

  private getPositiveInt(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }

  private async findVisibleReportById(id: string): Promise<MapEventDto | null> {
    const rows = (await this.parsedEventsRepository.query(
      `
      SELECT
        pe.id,
        pe.event_type,
        pe.location_text,
        pe.sender_name,
        pe.description,
        pe.confidence,
        pe.event_time,
        pe.created_at,
        pe.expires_at,
        pe.latitude,
        pe.longitude,
        pe.geo_source,
        pe.upvotes,
        pe.downvotes
      FROM parsed_events pe
      WHERE pe.id = $1
        AND pe.enriched_at IS NOT NULL
        AND pe.expires_at > NOW()
        AND pe.moderation_status IN ('auto_approved', 'approved')
        AND pe.downvotes <= pe.upvotes * 2
      LIMIT 1
      `,
      [id],
    )) as Array<{
      id: string;
      event_type: string;
      location_text: string | null;
      sender_name: string | null;
      description: string | null;
      confidence: number;
      event_time: Date | null;
      created_at: Date;
      expires_at: Date;
      latitude: number | null;
      longitude: number | null;
      geo_source:
        | "fallback"
        | "nominatim"
        | "cache"
        | "google"
        | "google_partial"
        | null;
      upvotes: number;
      downvotes: number;
    }>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      eventType: row.event_type,
      locationText: row.location_text,
      senderName: row.sender_name,
      description: row.description,
      confidence: Number(row.confidence),
      eventTime: row.event_time,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lat: row.latitude,
      lng: row.longitude,
      geoSource: row.geo_source,
      upvotes: Number(row.upvotes),
      downvotes: Number(row.downvotes),
    };
  }
}
