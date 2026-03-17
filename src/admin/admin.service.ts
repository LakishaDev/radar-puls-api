import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { GeocodingCacheEntity } from "../database/geocoding-cache.entity";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { RawEventEntity } from "../database/raw-event.entity";
import { normalizeText } from "../geocoding/geocoding.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { AdminActivityLogService } from "./admin-activity-log.service";
import { AdminStatsDto } from "./dto/admin-stats.dto";
import { AdminEventsQueryDto } from "./dto/admin-events-query.dto";
import { BulkConfirmLocationDto } from "./dto/bulk-confirm-location.dto";
import { ConfirmLocationDto } from "./dto/confirm-location.dto";
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
    @InjectRepository(GeocodingCacheEntity)
    private readonly geocodingCacheRepository: Repository<GeocodingCacheEntity>,
    private readonly logger: AppLogger,
    private readonly activityLog: AdminActivityLogService,
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
        pe.edit_source,
        pe.moderation_status,
        pe.moderated_by,
        pe.moderated_at,
        pe.moderation_note,
        pe.hidden_at,
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
        pe.edit_source,
        pe.moderation_status,
        pe.moderated_by,
        pe.moderated_at,
        pe.moderation_note,
        pe.hidden_at,
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

  async updateEvent(
    id: string,
    dto: UpdateAdminEventDto,
  ): Promise<{ id: string; edit_source: string }> {
    const oldRows = (await this.parsedEventsRepository.query(
      `
      SELECT event_type, location_text, sender_name, description, latitude, longitude, confidence, geo_source
      FROM parsed_events
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    )) as Array<Record<string, unknown>>;

    if (oldRows.length === 0) {
      throw new NotFoundException("Event not found");
    }

    const updates: string[] = [];
    const params: unknown[] = [id];
    const coordinatesTouched = dto.latitude !== undefined || dto.longitude !== undefined;

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
    if (dto.latitude !== undefined) {
      params.push(dto.latitude);
      updates.push(`latitude = $${params.length}`);
    }
    if (dto.longitude !== undefined) {
      params.push(dto.longitude);
      updates.push(`longitude = $${params.length}`);
    }
    if (dto.geoSource !== undefined) {
      params.push(dto.geoSource);
      updates.push(`geo_source = $${params.length}`);
    }
    if (dto.confidence !== undefined) {
      params.push(dto.confidence);
      updates.push(`confidence = $${params.length}`);
    }
    if (dto.eventTime !== undefined) {
      params.push(dto.eventTime ? new Date(dto.eventTime) : null);
      updates.push(`event_time = $${params.length}`);
    }
    if (dto.expiresAt !== undefined) {
      params.push(dto.expiresAt ? new Date(dto.expiresAt) : null);
      updates.push(`expires_at = $${params.length}`);
    }

    if (updates.length === 0) {
      throw new BadRequestException("No fields provided for update");
    }

    updates.push(`edit_source = 'admin_edited'`);

    if (coordinatesTouched) {
      updates.push(`geo_source = 'admin'`);
      updates.push(`moderation_status = 'approved'`);
      updates.push(`moderated_by = 'admin'`);
      updates.push(`moderated_at = NOW()`);
    }

    const updateResult = await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        ${updates.join(",")},
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, edit_source
      `,
      params,
    );
    const rows = this.extractRows<{ id: string; edit_source: string }>(updateResult);

    if (rows.length === 0) {
      throw new NotFoundException("Event not found");
    }

    this.logger.info("admin_event_updated", {
      id: rows[0].id,
      edit_source: rows[0].edit_source,
      coordinates_touched: coordinatesTouched,
    });

    this.realtimePublisher?.publish({
      type: "report_updated",
      reportId: rows[0].id,
      payload: { id: rows[0].id, edit_source: rows[0].edit_source },
    });

    await this.activityLog.log({
      eventId: id,
      action: "update",
      oldValues: oldRows[0] ?? null,
      newValues: {
        eventType: dto.eventType,
        locationText: dto.locationText,
        senderName: dto.senderName,
        description: dto.description,
        latitude: dto.latitude,
        longitude: dto.longitude,
        geoSource: dto.geoSource,
        confidence: dto.confidence,
      },
    });

    return rows[0];
  }

  async confirmLocation(
    id: string,
    dto: ConfirmLocationDto,
  ): Promise<{ id: string; cached: boolean }> {
    const eventRows = (await this.parsedEventsRepository.query(
      `
      SELECT id, location_text, latitude, longitude
      FROM parsed_events
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    )) as Array<{
      id: string;
      location_text: string | null;
      latitude: number | null;
      longitude: number | null;
    }>;

    const event = eventRows[0];
    if (!event) {
      throw new NotFoundException("Event not found");
    }

    const latitude = dto.latitude ?? (event.latitude !== null ? Number(event.latitude) : null);
    const longitude = dto.longitude ?? (event.longitude !== null ? Number(event.longitude) : null);
    const locationText = dto.locationText ?? event.location_text;

    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !locationText ||
      locationText.trim().length === 0
    ) {
      throw new BadRequestException(
        "latitude, longitude and locationText are required (from request or existing event)",
      );
    }

    const normalizedText = normalizeText(locationText);
    if (!normalizedText) {
      throw new BadRequestException("locationText cannot be normalized");
    }

    const cacheResult = await this.geocodingCacheRepository.query(
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
      VALUES ($1, $2, $3, $4, false, 'ADMIN_CONFIRMED', $1, NULL, 1, true, NOW(), NOW())
      ON CONFLICT (normalized_text)
      DO UPDATE SET
        location_text = EXCLUDED.location_text,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        is_partial = false,
        location_type = 'ADMIN_CONFIRMED',
        formatted_addr = EXCLUDED.formatted_addr,
        verified = true,
        hit_count = geocoding_cache.hit_count + 1,
        updated_at = NOW()
      RETURNING id
      `,
      [locationText.trim(), normalizedText, latitude, longitude],
    );
    const cachedRows = this.extractRows<{ id: string }>(cacheResult);

    const confirmResult = await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        location_text = $2,
        latitude = $3,
        longitude = $4,
        geo_source = 'admin_confirmed',
        edit_source = 'admin_confirmed',
        moderation_status = 'approved',
        moderated_by = $5,
        moderated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
      `,
      [id, locationText.trim(), latitude, longitude, dto.confirmedBy ?? "admin"],
    );
    const updatedRows = this.extractRows<{ id: string }>(confirmResult);

    if (updatedRows.length === 0) {
      throw new NotFoundException("Event not found");
    }

    this.logger.info("admin_location_confirmed", {
      id: updatedRows[0].id,
      normalized_text: normalizedText,
      cache_row_id: cachedRows[0]?.id ?? null,
    });

    this.realtimePublisher?.publish({
      type: "report_updated",
      reportId: updatedRows[0].id,
      payload: { id: updatedRows[0].id, geo_source: "admin_confirmed", edit_source: "admin_confirmed" },
    });

    await this.activityLog.log({
      eventId: id,
      action: "confirm_location",
      performedBy: dto.confirmedBy ?? "admin",
      newValues: {
        latitude,
        longitude,
        locationText: locationText.trim(),
        geo_source: "admin_confirmed",
      },
    });

    return { id: updatedRows[0].id, cached: cachedRows.length > 0 };
  }

  async approveEvent(
    id: string,
    dto: AdminModerationActionDto,
  ): Promise<{ id: string; moderation_status: string }> {
    const updateResult = await this.parsedEventsRepository.query(
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
    );
    const rows = this.extractRows<{ id: string; moderation_status: string }>(updateResult);

    if ((rows ?? []).length === 0) {
      throw new NotFoundException("Event not found");
    }

    this.realtimePublisher?.publish({
      type: "report_updated",
      reportId: rows[0].id,
      payload: { id: rows[0].id, moderation_status: rows[0].moderation_status },
    });

    await this.activityLog.log({
      eventId: id,
      action: "approve",
      performedBy: dto.moderatedBy ?? "admin",
      newValues: { moderation_status: "approved" },
      note: dto.note ?? null,
    });

    return rows[0];
  }

  async rejectEvent(
    id: string,
    dto: AdminModerationActionDto,
  ): Promise<{ id: string; moderation_status: string }> {
    const updateResult = await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        moderation_status = 'rejected',
        moderated_by = $2,
        moderated_at = NOW(),
        moderation_note = $3,
        hidden_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, moderation_status
      `,
      [id, dto.moderatedBy ?? "admin", dto.note ?? null],
    );
    const rows = this.extractRows<{ id: string; moderation_status: string }>(updateResult);

    if ((rows ?? []).length === 0) {
      throw new NotFoundException("Event not found");
    }

    this.realtimePublisher?.publish({
      type: "report_removed",
      reportId: rows[0].id,
      payload: { id: rows[0].id, moderation_status: rows[0].moderation_status },
    });

    await this.activityLog.log({
      eventId: id,
      action: "reject",
      performedBy: dto.moderatedBy ?? "admin",
      newValues: { moderation_status: "rejected" },
      note: dto.note ?? null,
    });

    return rows[0];
  }

  async restoreEvent(
    id: string,
    dto: AdminModerationActionDto,
  ): Promise<{ id: string; moderation_status: string }> {
    const updateResult = await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        moderation_status = 'pending_review',
        hidden_at = NULL,
        moderated_by = $2,
        moderated_at = NOW(),
        moderation_note = $3,
        updated_at = NOW()
      WHERE id = $1
        AND moderation_status = 'rejected'
      RETURNING id, moderation_status
      `,
      [id, dto.moderatedBy ?? "admin", dto.note ?? "Restored by admin"],
    );
    const rows = this.extractRows<{ id: string; moderation_status: string }>(updateResult);

    if (rows.length === 0) {
      throw new NotFoundException("Event not found or not in rejected state");
    }

    await this.activityLog.log({
      eventId: id,
      action: "restore",
      performedBy: dto.moderatedBy ?? "admin",
      newValues: { moderation_status: "pending_review", hidden_at: null },
      note: dto.note ?? null,
    });

    this.realtimePublisher?.publish({
      type: "report_updated",
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
        (SELECT COUNT(*)::int FROM parsed_events WHERE edit_source = 'admin_edited') AS admin_edited_count,
        (SELECT COUNT(*)::int FROM parsed_events WHERE edit_source = 'admin_confirmed') AS admin_confirmed_count,
        (
          SELECT COUNT(*)::int
          FROM parsed_events
          WHERE geo_source = 'admin' OR geo_source = 'admin_confirmed'
        ) AS admin_geo_count,
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
      admin_edited_count: number;
      admin_confirmed_count: number;
      admin_geo_count: number;
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
    const updateResult = await this.parsedEventsRepository.query(
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
    );
    const rows = this.extractRows<{ id: string; enrich_status: string }>(updateResult);

    if ((rows ?? []).length === 0) {
      throw new NotFoundException("Event not found");
    }

    this.realtimePublisher?.publish({
      type: "report_removed",
      reportId: rows[0].id,
      payload: { id: rows[0].id, enrich_status: rows[0].enrich_status },
    });

    await this.activityLog.log({
      eventId: id,
      action: "re_enrich",
      newValues: { enrich_status: "pending" },
    });

    return rows[0];
  }

  async bulkConfirmLocation(
    dto: BulkConfirmLocationDto,
  ): Promise<{ confirmed: number; cached: number }> {
    const events = (await this.parsedEventsRepository.query(
      `
      SELECT id, location_text, latitude, longitude, geo_source
      FROM parsed_events
      WHERE id = ANY($1::uuid[])
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND location_text IS NOT NULL
      `,
      [dto.eventIds],
    )) as Array<{
      id: string;
      location_text: string;
      latitude: number;
      longitude: number;
      geo_source: string | null;
    }>;

    if (events.length === 0) {
      return { confirmed: 0, cached: 0 };
    }

    const seen = new Set<string>();
    let cached = 0;
    for (const evt of events) {
      const normalized = normalizeText(evt.location_text);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);

      await this.parsedEventsRepository.query(
        `
        INSERT INTO geocoding_cache (location_text, normalized_text, lat, lng, is_partial, location_type, verified, hit_count, created_at, updated_at)
        VALUES ($1, $2, $3, $4, false, 'ADMIN_CONFIRMED', true, 1, NOW(), NOW())
        ON CONFLICT (normalized_text)
        DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          verified = true,
          location_type = 'ADMIN_CONFIRMED',
          hit_count = geocoding_cache.hit_count + 1,
          updated_at = NOW()
        `,
        [evt.location_text, normalized, evt.latitude, evt.longitude],
      );
      cached += 1;
    }

    const bulkResult = await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        geo_source = 'admin_confirmed',
        edit_source = 'admin_confirmed',
        moderated_by = $2,
        moderated_at = NOW(),
        updated_at = NOW()
      WHERE id = ANY($1::uuid[])
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      RETURNING id
      `,
      [dto.eventIds, dto.confirmedBy ?? "admin"],
    );
    const updatedRows = this.extractRows<{ id: string }>(bulkResult);

    for (const evt of events) {
      await this.activityLog.log({
        eventId: evt.id,
        action: "bulk_confirm",
        performedBy: dto.confirmedBy ?? "admin",
        newValues: {
          geo_source: "admin_confirmed",
          latitude: evt.latitude,
          longitude: evt.longitude,
        },
      });
    }

    return { confirmed: updatedRows.length, cached };
  }

  async getConfirmLocationCandidates(): Promise<unknown[]> {
    const rows = await this.parsedEventsRepository.query(`
      SELECT
        pe.location_text,
        ROUND(pe.latitude::numeric, 4) AS lat,
        ROUND(pe.longitude::numeric, 4) AS lng,
        pe.geo_source,
        COUNT(*)::int AS occurrence_count,
        array_agg(pe.id ORDER BY pe.created_at DESC) AS event_ids
      FROM parsed_events pe
      LEFT JOIN geocoding_cache gc
        ON gc.normalized_text = LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              TRANSLATE(pe.location_text, 'čćžšđČĆŽŠĐ', 'cczsdjCCZSD'),
              '[^a-zA-Z0-9\\s]', ' ', 'g'
            ),
            '\\s+', ' ', 'g'
          )
        )
        AND gc.verified = true
      WHERE pe.latitude IS NOT NULL
        AND pe.longitude IS NOT NULL
        AND pe.location_text IS NOT NULL
        AND pe.geo_source NOT IN ('admin', 'admin_confirmed')
        AND gc.id IS NULL
      GROUP BY pe.location_text, ROUND(pe.latitude::numeric, 4), ROUND(pe.longitude::numeric, 4), pe.geo_source
      HAVING COUNT(*) >= 5
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `);

    return rows;
  }

  async getEventActivityLog(eventId: string): Promise<unknown> {
    return this.activityLog.getLogsForEvent(eventId);
  }

  async getRecentActivityLog(limit: number): Promise<unknown> {
    return this.activityLog.getRecentLogs(limit);
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

  private extractRows<T>(result: unknown): T[] {
    if (!Array.isArray(result)) {
      return [];
    }

    if (
      result.length === 2 &&
      Array.isArray(result[0]) &&
      typeof result[1] === "number"
    ) {
      return result[0] as T[];
    }

    return result as T[];
  }
}
