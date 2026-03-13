import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DeviceTokenService } from "../auth/device-token.service";
import { AppLogger } from "../common/app.logger";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { RawEventEntity } from "../database/raw-event.entity";
import { EventType } from "../parsing/types";
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
    this.deviceTokenService.assertTokenAuthorized(params.authToken);

    const since = this.resolveSince(params.since);
    const eventTypes = this.resolveEventTypes(params.eventTypes);
    const geoOnly = params.geoOnly !== "false";

    const rows = (await this.parsedEventsRepository.query(
      `
      SELECT
        pe.id,
        pe.event_type,
        pe.location_text,
        pe.sender_name,
        pe.event_time,
        pe.latitude,
        pe.longitude,
        pe.geo_source,
        re.raw_message
      FROM parsed_events pe
      INNER JOIN raw_events re ON re.id = pe.raw_event_id
      WHERE pe.enriched_at IS NOT NULL
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
      event_time: Date | null;
      latitude: number | null;
      longitude: number | null;
      geo_source: "fallback" | "nominatim" | null;
      raw_message: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      locationText: row.location_text,
      senderName: row.sender_name,
      eventTime: row.event_time,
      lat: row.latitude,
      lng: row.longitude,
      geoSource: row.geo_source,
      rawMessage: row.raw_message,
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
