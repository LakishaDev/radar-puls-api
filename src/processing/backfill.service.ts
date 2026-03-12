import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { RawEventEntity } from "../database/raw-event.entity";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { ParsingService } from "../parsing/parsing.service";

/**
 * Backfill service — reparsira već obrađene raw events bez oslanjanja na live pending queue
 * Ideja: batch replay sa minimalnim scope i kontrolisanim filterima
 */
@Injectable()
export class BackfillService {
  constructor(
    @InjectRepository(RawEventEntity)
    private readonly rawEventsRepository: Repository<RawEventEntity>,
    @InjectRepository(ParsedEventEntity)
    private readonly parsedEventsRepository: Repository<ParsedEventEntity>,
    private readonly parsingService: ParsingService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Backfill processed events — reparsira sve već processed zapise (bez pending/processing)
   * Filter opcije: vremenski opseg, limit
   */
  async backfillProcessedEvents(options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<{ replayed: number; errors: number; duration: number }> {
    const startTime = Date.now();
    let replayed = 0;
    let errors = 0;

    const limit = options.limit ?? 50;
    const startDate = options.startDate;
    const endDate = options.endDate ?? new Date();

    // Build query za processed events
    let query = this.rawEventsRepository
      .createQueryBuilder("re")
      .where("re.processing_status = :status", { status: "processed" });

    if (startDate) {
      query = query.andWhere("re.created_at >= :startDate", { startDate });
    }

    query = query
      .andWhere("re.created_at <= :endDate", { endDate })
      .orderBy("re.created_at", "ASC")
      .take(limit);

    const rawEvents = await query.getMany();

    this.logger.info("backfill_started", {
      target_count: rawEvents.length,
      limit,
      startDate: options.startDate?.toISOString(),
      endDate: endDate.toISOString(),
    });

    // Za svakog raw event
    for (const rawEvent of rawEvents) {
      try {
        // Parse
        const parseResult = await this.parsingService.parseRawMessage({
          rawMessage: rawEvent.rawMessage,
          receivedAt: rawEvent.receivedAt,
          source: rawEvent.source,
          groupName: rawEvent.groupName,
          deviceId: rawEvent.deviceId,
        });

        // Upsert parsed event (isti upsert kao live worker)
        await this.parsingService.persistParsed(rawEvent.id, parseResult);

        replayed++;

        this.logger.info("backfill_processed_event", {
          raw_event_id: rawEvent.id,
          parse_status: parseResult.status,
          event_type: parseResult.eventType,
          confidence: parseResult.confidence,
        });
      } catch (error) {
        errors++;
        this.logger.error("backfill_error", {
          raw_event_id: rawEvent.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    const duration = Date.now() - startTime;

    this.logger.info("backfill_completed", {
      replayed,
      errors,
      duration_ms: duration,
      source_count: rawEvents.length,
    });

    return { replayed, errors, duration };
  }

  /**
   * Backfill by specific raw event IDs — reparseuj samo određene zapise
   */
  async backfillByRawEventIds(ids: string[]): Promise<{ replayed: number; errors: number }> {
    let replayed = 0;
    let errors = 0;

    this.logger.info("backfill_by_ids_started", {
      count: ids.length,
    });

    for (const id of ids) {
      try {
        const rawEvent = await this.rawEventsRepository.findOne({ where: { id } });

        if (!rawEvent) {
          this.logger.warn("backfill_event_not_found", { raw_event_id: id });
          continue;
        }

        // Parse
        const parseResult = await this.parsingService.parseRawMessage({
          rawMessage: rawEvent.rawMessage,
          receivedAt: rawEvent.receivedAt,
          source: rawEvent.source,
          groupName: rawEvent.groupName,
          deviceId: rawEvent.deviceId,
        });

        // Upsert
        await this.parsingService.persistParsed(rawEvent.id, parseResult);

        replayed++;

        this.logger.info("backfill_processed_event", {
          raw_event_id: id,
          parse_status: parseResult.status,
        });
      } catch (error) {
        errors++;
        this.logger.error("backfill_error", {
          raw_event_id: id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    this.logger.info("backfill_by_ids_completed", {
      replayed,
      errors,
      total: ids.length,
    });

    return { replayed, errors };
  }

  /**
   * Find processed events without parsed entries — recovery operacija
   */
  async findProcessedWithoutParsed(limit: number = 100): Promise<{ count: number }> {
    // Query: processed events where parsed_events is null
    const missingParsed = await this.rawEventsRepository.query(
      `
      SELECT COUNT(*) as count
      FROM raw_events re
      WHERE re.processing_status = 'processed'
      AND NOT EXISTS (
        SELECT 1 FROM parsed_events pe WHERE pe.raw_event_id = re.id
      )
      LIMIT $1
      `,
      [limit],
    );

    const count = parseInt(missingParsed[0]?.count ?? "0", 10);

    this.logger.info("backfill_missing_parsed_found", {
      count,
      limit,
    });

    return { count };
  }
}
