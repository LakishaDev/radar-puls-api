import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import {
  EnrichStatus,
  EventType,
  ParsedEvent,
  ParsingContext,
  ParsingResult,
  ParseStatus,
} from "./types";

@Injectable()
export class ParsingService {
  private readonly parserVersion: string = "v1.0";

  constructor(
    @InjectRepository(ParsedEventEntity)
    private readonly parsedEventsRepository: Repository<ParsedEventEntity>,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    const envVersion = this.configService.get<string>("PARSER_VERSION");
    if (envVersion) {
      this.parserVersion = envVersion;
    }
  }

  /**
   * Main entry point — minimal rule phase (readable check + HH:MM extraction)
   */
  async parseRawMessage(context: ParsingContext): Promise<ParsingResult> {
    const parseStatus: ParseStatus = this.isReadableText(context.rawMessage)
      ? "parsed"
      : "no_match";
    const eventTime = parseStatus === "parsed" ? this.extractTime(context.rawMessage) : null;
    const enrichStatus: EnrichStatus | null = parseStatus === "parsed" ? "pending" : null;

    const result: ParsingResult = {
      status: parseStatus,
      eventType: "unknown",
      locationText: null,
      senderName: null,
      description: null,
      eventTime,
      confidence: 0,
      enrichStatus,
    };

    this.logger.info("parse_result", {
      status: parseStatus,
      event_type: result.eventType,
      confidence: result.confidence,
      has_location: Boolean(result.locationText),
      has_time: Boolean(eventTime),
      enrich_status: enrichStatus,
      device_id: context.deviceId,
      source: context.source,
      group_name: context.groupName,
    });

    return result;
  }

  /**
   * Message readability filter for noisy/non-text inputs.
   */
  private isReadableText(raw: string): boolean {
    const trimmed = raw.trim();
    if (trimmed.length < 3) {
      return false;
    }

    const letterOrSpaceCount = Array.from(trimmed).filter((char) =>
      /\p{L}|\s/u.test(char),
    ).length;

    return letterOrSpaceCount / trimmed.length >= 0.5;
  }

  /**
   * Extract first explicit HH:MM occurrence.
   */
  private extractTime(rawMessage: string): Date | null {
    const match = rawMessage.match(/\b(\d{1,2}):(\d{2})\b/u);
    if (!match) {
      return null;
    }

    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  }

  /**
   * Persist parsed result to database with upsert semantics
   */
  async persistParsed(rawEventId: string, result: ParsingResult): Promise<ParsedEvent> {
    const existing = await this.parsedEventsRepository.findOne({
      where: { rawEventId },
    });

    let entity: ParsedEventEntity;

    if (existing) {
      // Update existing
      await this.parsedEventsRepository.update(existing.id, {
        parseStatus: result.status,
        eventType: result.eventType,
        locationText: result.locationText,
        senderName: result.senderName,
        description: result.description,
        eventTime: result.eventTime,
        confidence: result.confidence,
        enrichStatus: result.enrichStatus,
        enrichedAt: null,
        parserVersion: this.parserVersion,
        updatedAt: new Date(),
      });

      entity = (await this.parsedEventsRepository.findOne({
        where: { rawEventId },
      }))!;
    } else {
      // Insert new
      entity = this.parsedEventsRepository.create({
        rawEventId,
        parseStatus: result.status,
        eventType: result.eventType,
        locationText: result.locationText,
        senderName: result.senderName,
        description: result.description,
        eventTime: result.eventTime,
        confidence: result.confidence,
        enrichStatus: result.enrichStatus,
        enrichedAt: null,
        parserVersion: this.parserVersion,
      });

      await this.parsedEventsRepository.save(entity);
    }

    return {
      id: entity.id,
      rawEventId: entity.rawEventId,
      parseStatus: entity.parseStatus as ParseStatus,
      eventType: entity.eventType as EventType,
      locationText: entity.locationText,
      senderName: entity.senderName,
      description: entity.description,
      eventTime: entity.eventTime,
      confidence: entity.confidence,
      enrichStatus: entity.enrichStatus as EnrichStatus | null,
      enrichedAt: entity.enrichedAt,
      parserVersion: entity.parserVersion,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
