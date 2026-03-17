import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import { Repository } from "typeorm";
import { DeviceTokenService } from "../auth/device-token.service";
import { AppLogger } from "../common/app.logger";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { RawEventEntity } from "../database/raw-event.entity";
import { EventType } from "../parsing/types";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { CreateViberEventDto } from "./dto/create-viber-event.dto";
import { MapEventDto } from "./dto/map-event.dto";

const ALLOWED_EVENT_TYPES: EventType[] = [
  "police",
  "accident",
  "traffic_jam",
  "radar",
  "control",
  "unknown",
];

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(RawEventEntity)
    private readonly rawEventsRepository: Repository<RawEventEntity>,
    @InjectRepository(ParsedEventEntity)
    private readonly parsedEventsRepository: Repository<ParsedEventEntity>,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly logger: AppLogger,
    @Optional() private readonly realtimePublisher?: RealtimePublisher,
  ) {}

  async ingestViberEvent(
    dto: CreateViberEventDto,
    authToken: string,
    requestId: string,
  ): Promise<{ status: string; request_id: string }> {
    this.deviceTokenService.assertAuthorized(dto.device_id, authToken);

    try {
      const entity = this.rawEventsRepository.create({
        source: dto.source,
        groupName: dto.group,
        rawMessage: dto.message,
        eventTimestamp: new Date(dto.timestamp),
        receivedAt: new Date(),
        deviceId: dto.device_id,
        processingStatus: "pending",
      });

      await this.rawEventsRepository.save(entity);

      this.logger.info("event_stored", {
        request_id: requestId,
        device_id: dto.device_id,
        source: dto.source,
      });

      return {
        status: "accepted",
        request_id: requestId,
      };
    } catch (error) {
      this.logger.error("event_store_failed", {
        request_id: requestId,
        reason: error instanceof Error ? error.message : "unknown",
      });
      throw new InternalServerErrorException();
    }
  }

  async getMapEvents(params: {
    authToken: string;
    since?: string;
    eventTypes?: string;
    geoOnly?: string;
  }): Promise<MapEventDto[]> {
    return this.queryMapEvents({
      authToken: params.authToken,
      since: params.since,
      eventTypes: params.eventTypes,
      geoOnly: params.geoOnly,
      includeRawMessage: true,
      requireAuth: true,
    });
  }

  async getPublicMapEvents(params: {
    since?: string;
    eventTypes?: string;
    geoOnly?: string;
  }): Promise<MapEventDto[]> {
    return this.queryMapEvents({
      since: params.since,
      eventTypes: params.eventTypes,
      geoOnly: params.geoOnly,
      includeRawMessage: false,
      requireAuth: false,
    });
  }

  async voteForReport(params: {
    reportId: string;
    vote: "up" | "down";
    clientId: string;
  }): Promise<{ id: string; upvotes: number; downvotes: number }> {
    const activeRows = (await this.parsedEventsRepository.query(
      `
      SELECT id
      FROM parsed_events
      WHERE id = $1
        AND enriched_at IS NOT NULL
        AND expires_at > NOW()
        AND moderation_status IN ('auto_approved', 'approved')
      LIMIT 1
      `,
      [params.reportId],
    )) as Array<{ id: string }>;

    if (activeRows.length === 0) {
      throw new NotFoundException("Report unavailable");
    }

    const voterHash = createHash("sha256").update(params.clientId).digest("hex");
    const voteInsertRows = (await this.parsedEventsRepository.query(
      `
      INSERT INTO map_report_votes (parsed_event_id, voter_hash, vote)
      VALUES ($1, $2, $3)
      ON CONFLICT (parsed_event_id, voter_hash) DO NOTHING
      RETURNING id
      `,
      [params.reportId, voterHash, params.vote],
    )) as Array<{ id: string }>;

    if (voteInsertRows.length === 0) {
      throw new HttpException("Rate limited", HttpStatus.TOO_MANY_REQUESTS);
    }

    const updatedRows = (await this.parsedEventsRepository.query(
      `
      UPDATE parsed_events
      SET
        upvotes = upvotes + CASE WHEN $2 = 'up' THEN 1 ELSE 0 END,
        downvotes = downvotes + CASE WHEN $2 = 'down' THEN 1 ELSE 0 END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, upvotes, downvotes
      `,
      [params.reportId, params.vote],
    )) as Array<{ id: string; upvotes: number; downvotes: number }>;

    if (updatedRows.length === 0) {
      throw new InternalServerErrorException("Report vote update failed");
    }

    const updated = updatedRows[0];
    if (updated.downvotes > updated.upvotes * 2) {
      this.realtimePublisher?.publish({
        type: "report_removed",
        reportId: updated.id,
        payload: { id: updated.id },
      });
    } else {
      this.realtimePublisher?.publish({
        type: "report_updated",
        reportId: updated.id,
        payload: {
          id: updated.id,
          upvotes: Number(updated.upvotes),
          downvotes: Number(updated.downvotes),
        },
      });
    }

    return updated;
  }

  async createPublicReport(params: {
    eventType: EventType;
    locationText: string;
    senderName?: string;
    description?: string;
    lat?: number;
    lng?: number;
    clientId: string;
  }): Promise<{ id: string; moderationStatus: string }> {
    const now = new Date();
    const deviceHash = createHash("sha256").update(params.clientId).digest("hex").slice(0, 16);
    const rawMessage = [params.eventType, params.locationText, params.description]
      .filter((chunk) => typeof chunk === "string" && chunk.length > 0)
      .join(" | ");

    const rawEntity = this.rawEventsRepository.create({
      source: "web",
      groupName: "public-map",
      rawMessage,
      eventTimestamp: now,
      receivedAt: now,
      deviceId: `web_${deviceHash}`,
      processingStatus: "processed",
      processedAt: now,
      retryCount: 0,
    });

    await this.rawEventsRepository.save(rawEntity);

    const rows = (await this.parsedEventsRepository.query(
      `
      INSERT INTO parsed_events (
        raw_event_id,
        parse_status,
        event_type,
        location_text,
        sender_name,
        description,
        event_time,
        confidence,
        enrich_status,
        enriched_at,
        latitude,
        longitude,
        geo_source,
        edit_source,
        moderation_status,
        parser_version
      )
      VALUES (
        $1,
        'parsed',
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        'enriched',
        NOW(),
        $8,
        $9,
        $10,
        'web_submitted',
        'pending_review',
        'web-v1'
      )
      RETURNING id, moderation_status
      `,
      [
        rawEntity.id,
        params.eventType,
        params.locationText,
        params.senderName?.trim() || null,
        params.description?.trim() || null,
        now,
        75,
        params.lat ?? null,
        params.lng ?? null,
        params.lat !== undefined && params.lng !== undefined ? "fallback" : null,
      ],
    )) as Array<{ id: string; moderation_status: string }>;

    if (rows.length === 0) {
      throw new InternalServerErrorException("Public report creation failed");
    }

    this.logger.info("public_report_created_pending_review", {
      parsed_event_id: rows[0].id,
      source: "web",
      event_type: params.eventType,
    });

    return {
      id: rows[0].id,
      moderationStatus: rows[0].moderation_status,
    };
  }

  async getPublicStats(): Promise<{
    total_reports_today: number;
    total_reports_week: number;
    busiest_area: string;
    most_common_type: string;
    peak_hour: string;
    reports_by_type: Array<{ type: string; count: number }>;
    reports_by_hour: Array<{ hour: number; count: number }>;
  }> {
    const [totals] = (await this.parsedEventsRepository.query(
      `
      WITH visible AS (
        SELECT *
        FROM parsed_events
        WHERE enriched_at IS NOT NULL
          AND expires_at > NOW()
          AND moderation_status IN ('auto_approved', 'approved')
          AND hidden_at IS NULL
          AND downvotes <= upvotes * 2
      )
      SELECT
        (SELECT COUNT(*)::int FROM visible WHERE created_at >= DATE_TRUNC('day', NOW())) AS total_reports_today,
        (SELECT COUNT(*)::int FROM visible WHERE created_at >= NOW() - INTERVAL '7 days') AS total_reports_week,
        (
          SELECT COALESCE(location_text, '')
          FROM visible
          WHERE location_text IS NOT NULL
          GROUP BY location_text
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) AS busiest_area,
        (
          SELECT event_type
          FROM visible
          GROUP BY event_type
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) AS most_common_type,
        (
          SELECT TO_CHAR(DATE_TRUNC('hour', created_at), 'HH24:00')
          FROM visible
          GROUP BY DATE_TRUNC('hour', created_at)
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) AS peak_hour
      `,
    )) as Array<{
      total_reports_today: number;
      total_reports_week: number;
      busiest_area: string | null;
      most_common_type: string | null;
      peak_hour: string | null;
    }>;

    const reportsByType = (await this.parsedEventsRepository.query(
      `
      SELECT event_type AS type, COUNT(*)::int AS count
      FROM parsed_events
      WHERE enriched_at IS NOT NULL
        AND expires_at > NOW()
        AND moderation_status IN ('auto_approved', 'approved')
        AND hidden_at IS NULL
        AND downvotes <= upvotes * 2
      GROUP BY event_type
      ORDER BY count DESC
      `,
    )) as Array<{ type: string; count: number }>;

    const reportsByHour = (await this.parsedEventsRepository.query(
      `
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS count
      FROM parsed_events
      WHERE enriched_at IS NOT NULL
        AND expires_at > NOW()
        AND moderation_status IN ('auto_approved', 'approved')
        AND hidden_at IS NULL
        AND downvotes <= upvotes * 2
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour ASC
      `,
    )) as Array<{ hour: number; count: number }>;

    return {
      total_reports_today: totals?.total_reports_today ?? 0,
      total_reports_week: totals?.total_reports_week ?? 0,
      busiest_area: totals?.busiest_area ?? "",
      most_common_type: totals?.most_common_type ?? "unknown",
      peak_hour: totals?.peak_hour ?? "00:00",
      reports_by_type: reportsByType,
      reports_by_hour: reportsByHour,
    };
  }

  private async queryMapEvents(params: {
    authToken?: string;
    since?: string;
    eventTypes?: string;
    geoOnly?: string;
    includeRawMessage: boolean;
    requireAuth: boolean;
  }): Promise<MapEventDto[]> {
    if (params.requireAuth) {
      this.deviceTokenService.assertTokenAuthorized(params.authToken ?? "");
    }

    const since = this.resolveSince(params.since);
    const eventTypes = this.resolveEventTypes(params.eventTypes);
    const geoOnly = params.geoOnly !== "false";
    const rawMessageSelect = params.includeRawMessage ? ", re.raw_message" : "";
    const rawMessageJoin = params.includeRawMessage
      ? "INNER JOIN raw_events re ON re.id = pe.raw_event_id"
      : "";

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
        ${rawMessageSelect}
      FROM parsed_events pe
      ${rawMessageJoin}
      WHERE pe.enriched_at IS NOT NULL
        AND pe.expires_at > NOW()
        AND pe.moderation_status IN ('auto_approved', 'approved')
        AND pe.hidden_at IS NULL
        AND pe.downvotes <= pe.upvotes * 2
        AND pe.created_at >= $1
        AND (
          COALESCE(array_length($2::text[], 1), 0) = 0
          OR pe.event_type = ANY($2::text[])
        )
        AND ($3::boolean = FALSE OR pe.latitude IS NOT NULL)
      ORDER BY pe.created_at DESC
      `,
      [since.toISOString(), eventTypes, geoOnly],
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
      raw_message?: string;
    }>;

    return rows.map((row) => ({
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
      rawMessage: params.includeRawMessage ? row.raw_message : undefined,
    }));
  }

  private resolveSince(rawSince?: string): Date {
    if (!rawSince) {
      return new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    const parsed = new Date(rawSince);
    if (Number.isNaN(parsed.getTime())) {
      return new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    return parsed;
  }

  private resolveEventTypes(rawEventTypes?: string): EventType[] {
    if (!rawEventTypes) {
      return [];
    }

    const parsedTypes = rawEventTypes
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .filter((value): value is EventType =>
        ALLOWED_EVENT_TYPES.includes(value as EventType),
      );

    return Array.from(new Set(parsedTypes));
  }
}
