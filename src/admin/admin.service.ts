import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { RawEventEntity } from "../database/raw-event.entity";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { AdminStatsDto } from "./dto/admin-stats.dto";
import { AdminEventsQueryDto } from "./dto/admin-events-query.dto";
import {
  AdminBatchReEnrichDto,
  AdminModerationActionDto,
  UpdateAdminEventDto,
} from "./dto/update-admin-event.dto";

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(ParsedEventEntity)
    private readonly parsedEventsRepository: Repository<ParsedEventEntity>,
    @InjectRepository(RawEventEntity)
    private readonly rawEventsRepository: Repository<RawEventEntity>,
    @Optional() private readonly realtimePublisher?: RealtimePublisher,
  ) {}

  async listEvents(query: AdminEventsQueryDto): Promise<{
    items: unknown[];
    page: number;
    limit: number;
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    const where: string[] = [];

    if (query.status) {
      params.push(query.status);
      where.push(`pe.moderation_status = $${params.length}`);
    }
    if (query.eventType) {
      params.push(query.eventType);
      where.push(`pe.event_type = $${params.length}`);
    }
    if (query.parseStatus) {
      params.push(query.parseStatus);
      where.push(`pe.parse_status = $${params.length}`);
    }
    if (query.enrichStatus) {
      params.push(query.enrichStatus);
      where.push(`pe.enrich_status = $${params.length}`);
    }
    if (query.since) {
      params.push(new Date(query.since));
      where.push(`pe.created_at >= $${params.length}`);
    }
    if (query.until) {
      params.push(new Date(query.until));
      where.push(`pe.created_at <= $${params.length}`);
    }
    if (query.search && query.search.trim().length > 0) {
      params.push(`%${query.search.trim()}%`);
      where.push(`re.raw_message ILIKE $${params.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = (await this.parsedEventsRepository.query(
      `
      SELECT COUNT(*)::int AS total
      FROM parsed_events pe
      INNER JOIN raw_events re ON re.id = pe.raw_event_id
      ${whereSql}
      `,
      params,
    )) as Array<{ total: number }>;
    const total = countRows[0]?.total ?? 0;

    const listParams = [...params, limit, offset];
    const rows = await this.parsedEventsRepository.query(
      `
      SELECT
        pe.id,
        pe.raw_event_id,
        pe.parse_status,
        pe.event_type,
        pe.location_text,
        pe.sender_name,
        pe.description,
        pe.event_time,
        pe.confidence,
        pe.enrich_status,
        pe.enriched_at,
        pe.latitude,
        pe.longitude,
        pe.geo_source,
        pe.moderation_status,
        pe.moderated_by,
        pe.moderated_at,
        pe.moderation_note,
        pe.created_at,
        pe.updated_at,
        pe.expires_at,
        pe.upvotes,
        pe.downvotes,
        re.raw_message,
        re.source,
        re.group_name,
        re.device_id,
        re.event_timestamp,
        re.received_at
      FROM parsed_events pe
      INNER JOIN raw_events re ON re.id = pe.raw_event_id
      ${whereSql}
      ORDER BY pe.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
      `,
      listParams,
    );

    return {
      items: rows,
      page,
      limit,
      total,
    };
  }

  async getEventById(id: string): Promise<unknown> {
    const rows = await this.parsedEventsRepository.query(
      `
      SELECT
        pe.id,
        pe.raw_event_id,
        pe.parse_status,
        pe.event_type,
        pe.location_text,
        pe.sender_name,
        pe.description,
        pe.event_time,
        pe.confidence,
        pe.enrich_status,
        pe.enriched_at,
        pe.enrich_attempts,
        pe.enrich_next_retry_at,
        pe.latitude,
        pe.longitude,
        pe.geo_source,
        pe.moderation_status,
        pe.moderated_by,
        pe.moderated_at,
        pe.moderation_note,
        pe.parser_version,
        pe.created_at,
        pe.updated_at,
        pe.expires_at,
        pe.upvotes,
        pe.downvotes,
        re.raw_message,
        re.source,
        re.group_name,
        re.device_id,
        re.processing_status,
        re.retry_count,
        re.event_timestamp,
        re.received_at,
        re.processed_at,
        re.failed_at,
        re.last_error
      FROM parsed_events pe
      INNER JOIN raw_events re ON re.id = pe.raw_event_id
      WHERE pe.id = $1
      LIMIT 1
      `,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException("Event not found");
    }

    return rows[0];
  }

  async updateEvent(id: string, dto: UpdateAdminEventDto): Promise<{ id: string }> {
    const updates: string[] = [];
    const params: unknown[] = [id];

    if (dto.eventType !== undefined) {
      params.push(dto.eventType);
      updates.push(`event_type = $${params.length}`);
    }
    if (dto.locationText !== undefined) {
      params.push(dto.locationText);
      updates.push(`location_text = $${params.length}`);
    }
    if (dto.senderName !== undefined) {
      params.push(dto.senderName);
      updates.push(`sender_name = $${params.length}`);
    }
    if (dto.description !== undefined) {
      params.push(dto.description);
      updates.push(`description = $${params.length}`);
    }

    if (updates.length === 0) {
      throw new BadRequestException("No fields provided for update");
    }

    const [rows] = (await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        ${updates.join(",")},
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
      `,
      params,
    )) as [Array<{ id: string }>, number];

    if ((rows ?? []).length === 0) {
      throw new NotFoundException("Event not found");
    }

    this.realtimePublisher?.publish({
      type: "report_updated",
      reportId: rows[0].id,
      payload: { id: rows[0].id },
    });

    return { id: rows[0].id };
  }

  async approveEvent(
    id: string,
    dto: AdminModerationActionDto,
  ): Promise<{ id: string; moderation_status: string }> {
    const [rows] = (await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        moderation_status = 'approved',
        moderated_by = $2,
        moderated_at = NOW(),
        moderation_note = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, moderation_status
      `,
      [id, dto.moderatedBy ?? "admin", dto.note ?? null],
    )) as [Array<{ id: string; moderation_status: string }>, number];

    if ((rows ?? []).length === 0) {
      throw new NotFoundException("Event not found");
    }

    this.realtimePublisher?.publish({
      type: "report_updated",
      reportId: rows[0].id,
      payload: { id: rows[0].id, moderation_status: rows[0].moderation_status },
    });

    return rows[0];
  }

  async rejectEvent(
    id: string,
    dto: AdminModerationActionDto,
  ): Promise<{ id: string; moderation_status: string }> {
    const [rows] = (await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        moderation_status = 'rejected',
        moderated_by = $2,
        moderated_at = NOW(),
        moderation_note = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, moderation_status
      `,
      [id, dto.moderatedBy ?? "admin", dto.note ?? null],
    )) as [Array<{ id: string; moderation_status: string }>, number];

    if ((rows ?? []).length === 0) {
      throw new NotFoundException("Event not found");
    }

    this.realtimePublisher?.publish({
      type: "report_removed",
      reportId: rows[0].id,
      payload: { id: rows[0].id, moderation_status: rows[0].moderation_status },
    });

    return rows[0];
  }

  async getStats(): Promise<AdminStatsDto> {
    const [rawStats] = (await this.rawEventsRepository.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM raw_events) AS total_raw_events,
        (SELECT COUNT(*)::int FROM parsed_events) AS total_parsed,
        (SELECT COUNT(*)::int FROM parsed_events WHERE enrich_status = 'enriched') AS total_enriched,
        (SELECT COUNT(*)::int FROM parsed_events WHERE enrich_status = 'failed') AS total_failed,
        (SELECT COUNT(*)::int FROM parsed_events WHERE moderation_status = 'pending_review') AS pending_review,
        (SELECT COUNT(*)::int FROM parsed_events WHERE moderation_status = 'approved') AS approved,
        (SELECT COUNT(*)::int FROM parsed_events WHERE moderation_status = 'rejected') AS rejected,
        (SELECT COUNT(*)::int FROM parsed_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS events_last_24h,
        (SELECT COUNT(*)::int FROM parsed_events WHERE created_at >= NOW() - INTERVAL '7 days') AS events_last_7d,
        (
          SELECT COALESCE(
            ROUND(
              (
                COUNT(*) FILTER (WHERE enrich_status = 'enriched')::numeric
                / NULLIF(COUNT(*) FILTER (WHERE enrich_status IN ('enriched', 'failed')), 0)::numeric
              ) * 100,
              2
            ),
            0
          )
          FROM parsed_events
        ) AS enrichment_success_rate
      `,
    )) as Array<{
      total_raw_events: number;
      total_parsed: number;
      total_enriched: number;
      total_failed: number;
      pending_review: number;
      approved: number;
      rejected: number;
      events_last_24h: number;
      events_last_7d: number;
      enrichment_success_rate: number;
    }>;

    const topEventTypes = (await this.parsedEventsRepository.query(
      `
      SELECT event_type AS type, COUNT(*)::int AS count
      FROM parsed_events
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 5
      `,
    )) as Array<{ type: string; count: number }>;

    return {
      ...rawStats,
      top_event_types: topEventTypes,
    };
  }

  async reEnrichEvent(id: string): Promise<{ id: string; enrich_status: string }> {
    const [rows] = (await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        enrich_status = 'pending',
        enriched_at = NULL,
        enrich_attempts = 0,
        enrich_next_retry_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, enrich_status
      `,
      [id],
    )) as [Array<{ id: string; enrich_status: string }>, number];

    if ((rows ?? []).length === 0) {
      throw new NotFoundException("Event not found");
    }

    this.realtimePublisher?.publish({
      type: "report_removed",
      reportId: rows[0].id,
      payload: { id: rows[0].id, enrich_status: rows[0].enrich_status },
    });

    return rows[0];
  }

  async reEnrichBatch(dto: AdminBatchReEnrichDto): Promise<{ updated: number }> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (dto.status) {
      params.push(dto.status);
      where.push(`moderation_status = $${params.length}`);
    }
    if (dto.eventType) {
      params.push(dto.eventType);
      where.push(`event_type = $${params.length}`);
    }
    if (dto.enrichStatus) {
      params.push(dto.enrichStatus);
      where.push(`enrich_status = $${params.length}`);
    }
    if (dto.since) {
      params.push(new Date(dto.since));
      where.push(`created_at >= $${params.length}`);
    }
    if (dto.until) {
      params.push(new Date(dto.until));
      where.push(`created_at <= $${params.length}`);
    }
    if (dto.includeRejected !== "true") {
      where.push(`moderation_status <> 'rejected'`);
    }

    const limitRaw = dto.limit ? Number.parseInt(dto.limit, 10) : 100;
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, 500))
      : 100;
    params.push(limit);

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const [, rowCount] = (await this.parsedEventsRepository.query(
      `
      WITH candidate AS (
        SELECT id
        FROM parsed_events
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${params.length}
      )
      UPDATE parsed_events pe
      SET
        enrich_status = 'pending',
        enriched_at = NULL,
        enrich_attempts = 0,
        enrich_next_retry_at = NULL,
        updated_at = NOW()
      FROM candidate
      WHERE pe.id = candidate.id
      RETURNING pe.id
      `,
      params,
    )) as [Array<{ id: string }>, number];

    if ((rowCount ?? 0) > 0) {
      this.realtimePublisher?.publish({
        type: "report_updated",
        reportId: "batch",
        payload: { updated: rowCount ?? 0 },
      });
    }

    return {
      updated: rowCount ?? 0,
    };
  }
}
