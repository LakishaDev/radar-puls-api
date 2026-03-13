import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import OpenAI from "openai";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { GeocodingService } from "../geocoding/geocoding.service";
import { EventType } from "../parsing/types";

type PendingEnrichmentRecord = {
  id: string;
  rawEventId: string;
  rawMessage: string;
};

type EnrichmentExtraction = {
  senderName: string | null;
  locationText: string | null;
  eventType?: EventType;
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
  private readonly openai: OpenAI;

  private pollTimer: NodeJS.Timeout | null = null;
  private cycleInProgress = false;

  constructor(
    @InjectRepository(ParsedEventEntity)
    private readonly parsedEventsRepository: Repository<ParsedEventEntity>,
    private readonly geocodingService: GeocodingService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.pollIntervalMs = this.getPositiveInt("ENRICHMENT_POLL_INTERVAL_MS", 10_000);
    this.batchSize = this.getPositiveInt("ENRICHMENT_BATCH_SIZE", 10);
    this.model = this.configService.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini";
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
        error: error instanceof Error ? error.message : "unknown enrichment batch error",
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
      SELECT pe.id, pe.raw_event_id, re.raw_message
      FROM parsed_events pe
      INNER JOIN raw_events re ON re.id = pe.raw_event_id
      WHERE pe.enrich_status = 'pending'
      ORDER BY pe.created_at ASC
      LIMIT $1
      `,
      [limit],
    )) as Array<{ id: string; raw_event_id: string; raw_message: string }>;

    return rows.map((row) => ({
      id: row.id,
      rawEventId: row.raw_event_id,
      rawMessage: row.raw_message,
    }));
  }

  private async enrichEvent(event: PendingEnrichmentRecord): Promise<boolean> {
    try {
      const extraction = await this.extractStructuredData(event.rawMessage);
      const geoResult = extraction.locationText
        ? await this.geocodingService.geocodeLocation(extraction.locationText)
        : null;

      await this.parsedEventsRepository.query(
        `
        UPDATE parsed_events
        SET
          sender_name = $2,
          location_text = $3,
          event_type = COALESCE($4, event_type),
          latitude = $5,
          longitude = $6,
          geo_source = $7,
          enrich_status = 'enriched',
          enriched_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          event.id,
          extraction.senderName,
          extraction.locationText,
          extraction.eventType ?? null,
          geoResult?.lat ?? null,
          geoResult?.lng ?? null,
          geoResult?.source ?? null,
        ],
      );

      this.logger.info("enrichment_success", {
        parsed_event_id: event.id,
        raw_event_id: event.rawEventId,
        geo_source: geoResult?.source ?? null,
      });

      return true;
    } catch (error) {
      await this.parsedEventsRepository.query(
        `
        UPDATE parsed_events
        SET
          enrich_status = 'failed',
          updated_at = NOW()
        WHERE id = $1
        `,
        [event.id],
      );

      this.logger.error("enrichment_failed", {
        parsed_event_id: event.id,
        raw_event_id: event.rawEventId,
        error: error instanceof Error ? error.message : "unknown enrichment error",
      });

      return false;
    }
  }

  private async extractStructuredData(rawMessage: string): Promise<EnrichmentExtraction> {
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Analiziraj kratke Viber poruke o saobracaju u Nisu.

Vrati JSON:
{"senderName":string|null,"locationText":string|null,"eventType":"police"|"accident"|"traffic_jam"|"radar"|"control"|"unknown","lat":number|null,"lng":number|null}

Pravila:

senderName
- licno ime samo ako je na pocetku poruke (Marko, Petar, Ana)
- nazivi ulica ili mesta NISU imena
- ako nema imena vrati null

eventType
- duvaljka, alkotest, puse, zaustavljaju, kontrola → control
- murija, policija, mup, saobrac → police
- radar, laser, merenje → radar
- guzva, kolona, stoji → traffic_jam
- sudar, udes, cukanje → accident

locationText
- pretvori lokalni naziv u lokaciju pogodnu za OpenStreetMap Nominatim
- format: "<naziv mesta>, Nis"
- ukloni reci: kod, preko puta, ispred, iza
- primeri:
  "kod disa" → "DIS, Nis"
  "kod stop shopa" → "Stop Shop, Nis"
  "kod delte" → "Delta Planet, Nis"
  "kod elektronskog" → "Elektronska industrija, Nis"
  "bulevar nemanjica" → "Bulevar Nemanjica, Nis"

lat/lng
- ako nisi siguran vrati null

Odgovori samo JSON bez objasnjenja.`,
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
      senderName?: unknown;
      locationText?: unknown;
      eventType?: unknown;
    };

    const senderName =
      typeof parsed.senderName === "string" && parsed.senderName.trim().length > 0
        ? parsed.senderName.trim()
        : null;
    const locationText =
      typeof parsed.locationText === "string" && parsed.locationText.trim().length > 0
        ? parsed.locationText.trim()
        : null;
    const eventType =
      typeof parsed.eventType === "string" &&
      ALLOWED_EVENT_TYPES.includes(parsed.eventType as EventType)
        ? (parsed.eventType as EventType)
        : undefined;

    return {
      senderName,
      locationText,
      eventType,
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

}