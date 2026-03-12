import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import {
  CONFIDENCE_THRESHOLDS,
  EVENT_TYPE_KEYWORDS,
  EventType,
  LOCATION_KEYWORDS,
  ParsedEvent,
  ParsingContext,
  ParsingResult,
  ParseStatus,
  TIME_PATTERNS,
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
   * Main entry point — parse raw message and return result
   */
  async parseRawMessage(context: ParsingContext): Promise<ParsingResult> {
    const normalized = this.normalizeText(context.rawMessage);
    const original = context.rawMessage; // Keep original for case preservation

    const eventType = this.extractEventType(normalized);
    const locationText = this.extractLocation(normalized, original);
    const eventTime = this.extractTime(normalized);

    // Calculate confidence based on detected signals
    const signals = {
      eventTypeMatch: eventType !== "unknown" ? eventType : undefined,
      locationMatch: locationText ? "location_found" : undefined,
      timeExpressions: eventTime ? ["time_found"] : undefined,
      confidenceFactors: [] as string[],
    };

    const confidence = this.calculateConfidence(eventType, locationText, eventTime, signals);

    const parseStatus: ParseStatus =
      confidence >= CONFIDENCE_THRESHOLDS.MIN_FOR_PARSED ? "parsed" : "no_match";

    return {
      status: parseStatus,
      eventType: eventType, // Always return detected type, even if no_match
      locationText,
      description: this.generateDescription(
        context.rawMessage,
        eventType,
        locationText,
        eventTime,
      ),
      eventTime,
      confidence,
      signals,
    };
  }

  /**
   * Normalize text — lowercase, trim, remove extra spaces
   */
  private normalizeText(raw: string): string {
    return raw
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  }

  /**
   * Detect event type based on keywords
   */
  private extractEventType(normalized: string): EventType {
    const eventTypes: EventType[] = [
      "police",
      "accident",
      "traffic_jam",
      "radar",
      "control",
    ];

    for (const eventType of eventTypes) {
      const keywords = EVENT_TYPE_KEYWORDS[eventType];
      for (const keyword of keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          return eventType;
        }
      }
    }

    return "unknown";
  }

  /**
   * Extract location — look for keywords like "kod", "na", "blizu"
   * Uses normalized for searching, original for case preservation
   */
  private extractLocation(normalized: string, original: string): string | null {
    for (const keyword of LOCATION_KEYWORDS) {
      const keywordPattern = ` ${keyword} `;
      const idx = normalized.indexOf(keywordPattern);

      if (idx !== -1) {
        // Extract text after keyword from ORIGINAL for case preservation
        const originalAfterKeyword = original.substring(
          idx + keywordPattern.length,
        );

        // Find end in NORMALIZED version
        const normalizedAfterKeyword = normalized.substring(
          idx + keywordPattern.length,
        );
        let endIdx = normalizedAfterKeyword.length;

        // Look for " u 13:15" pattern (time)
        const timeMatch = normalizedAfterKeyword.match(/\s+u\s+\d{1,2}:\d{2}/i);
        if (timeMatch) {
          endIdx = timeMatch.index ?? normalizedAfterKeyword.length;
        } else {
          // Look for punctuation
          const punctMatch = normalizedAfterKeyword.match(/[,!?.]/);
          if (punctMatch) {
            endIdx = punctMatch.index ?? normalizedAfterKeyword.length;
          }
        }

        // Extract from ORIGINAL, trim, and capitalize first letter
        const locationRaw = originalAfterKeyword.substring(0, endIdx).trim();
        if (locationRaw.length > 0) {
          // Better capitalization: capitalize first letter, keep rest as original
          return locationRaw.charAt(0).toUpperCase() + locationRaw.slice(1);
        }
      }
    }

    return null;
  }

  /**
   * Extract time if mentioned explicitly
   */
  private extractTime(normalized: string): Date | null {
    for (const pattern of TIME_PATTERNS) {
      const match = normalized.match(pattern);
      if (match) {
        const hour = parseInt(match[1], 10);
        const minute = match[2] ? parseInt(match[2], 10) : 0;

        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
          const now = new Date();
          return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
        }
      }
    }

    return null;
  }

  /**
   * Calculate confidence score [0..1]
   * Based on number and type of detected signals
   */
  private calculateConfidence(
    eventType: EventType,
    locationText: string | null,
    eventTime: Date | null,
    signals: any,
  ): number {
    let confidence = 0;

    // Event type keyword match
    if (eventType !== "unknown") {
      confidence += CONFIDENCE_THRESHOLDS.EVENT_TYPE_KEYWORD;
      signals.confidenceFactors.push("event_type_detected");
    }

    // Location keyword match
    if (locationText) {
      confidence += CONFIDENCE_THRESHOLDS.LOCATION_KEYWORD;
      signals.confidenceFactors.push("location_detected");
    }

    // Time expression detected
    if (eventTime) {
      confidence += CONFIDENCE_THRESHOLDS.TIME_EXPRESSION;
      signals.confidenceFactors.push("time_detected");
    }

    // Multiple signals hit bonus
    const signalCount = [eventType !== "unknown" ? 1 : 0, locationText ? 1 : 0, eventTime ? 1 : 0].filter(
      (x) => x,
    ).length;
    if (signalCount >= 2) {
      confidence += CONFIDENCE_THRESHOLDS.MULTIPLE_SIGNALS;
      signals.confidenceFactors.push("multiple_signals");
    }

    // Cap confidence at 1.0
    return Math.min(confidence, 1.0);
  }

  /**
   * Generate human-readable description from parsed components
   */
  private generateDescription(
    rawMessage: string,
    eventType: EventType,
    locationText: string | null,
    eventTime: Date | null,
  ): string {
    const parts: string[] = [];

    if (eventType !== "unknown") {
      parts.push(`[${eventType}]`);
    }

    if (locationText) {
      parts.push(locationText);
    }

    if (eventTime) {
      const time = `${eventTime.getHours().toString().padStart(2, "0")}:${eventTime
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
      parts.push(`at ${time}`);
    }

    if (parts.length === 0) {
      return rawMessage.substring(0, 200);
    }

    return parts.join(" — ");
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
        description: result.description,
        eventTime: result.eventTime,
        confidence: result.confidence,
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
        description: result.description,
        eventTime: result.eventTime,
        confidence: result.confidence,
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
      description: entity.description,
      eventTime: entity.eventTime,
      confidence: entity.confidence,
      parserVersion: entity.parserVersion,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
