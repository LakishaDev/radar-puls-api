// Parser domain types for Serbian Viber messages

/**
 * status vrednosti za parsed events
 */
export type ParseStatus = 'parsed' | 'no_match' | 'partial';

/**
 * status vrednosti za AI enrichment fazu
 */
export type EnrichStatus = 'pending' | 'enriched' | 'failed';

/**
 * Dozvoljeni tipovi dogadjaja
 */
export type EventType =
  | 'police'
  | 'accident'
  | 'traffic_jam'
  | 'radar'
  | 'control'
  | 'unknown';

/**
 * Kontekst koji parser koristi za obradu raw message
 */
export interface ParsingContext {
  rawMessage: string;
  receivedAt: Date;
  source: string;
  groupName: string;
  deviceId: string;
}

/**
 * Interno stanje tokom parsiranja - signali za debug i confidence
 */
export interface ParsingSignals {
  eventTypeMatch?: string;
  locationMatch?: string;
  timeExpressions?: string[];
  confidenceFactors?: string[];
}

/**
 * Rezultat parsiranja pre upisa u bazu
 */
export interface ParsingResult {
  status: ParseStatus;
  eventType: EventType;
  locationText: string | null;
  senderName: string | null;
  description: string | null;
  eventTime: Date | null;
  confidence: number;
  enrichStatus: EnrichStatus | null;
  signals?: ParsingSignals;
}

/**
 * Finalni ParsedEvent model za perzistenciju
 */
export interface ParsedEvent {
  id?: string;
  rawEventId: string;
  parseStatus: ParseStatus;
  eventType: EventType;
  locationText: string | null;
  senderName: string | null;
  description: string | null;
  eventTime: Date | null;
  confidence: number;
  enrichStatus: EnrichStatus | null;
  enrichedAt: Date | null;
  parserVersion: string;
  createdAt?: Date;
  updatedAt?: Date;
}
