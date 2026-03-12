// Parser domain types for Serbian Viber messages

/**
 * status vrednosti za parsed events
 */
export type ParseStatus = 'parsed' | 'no_match' | 'partial';

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
  description: string | null;
  eventTime: Date | null;
  confidence: number;
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
  description: string | null;
  eventTime: Date | null;
  confidence: number;
  parserVersion: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Keywords i patterns za event type detection
 */
export const EVENT_TYPE_KEYWORDS: Record<EventType, string[]> = {
  police: [
    'policija',
    'policajac',
    'patrolna',
    'zaustavljanje',
    'kontrola vozača',
    'alkohol',
    'brzina',
    'prekršaj',
  ],
  accident: [
    'udes',
    'sudar',
    'nesreća',
    'kolizija',
    'vozač',
    'vozila',
    'sukobi',
    'preplitanje',
  ],
  traffic_jam: [
    'gužva',
    'zastoj',
    'saobraćaj',
    'guzva',
    'redovi',
    'sporо',
    'usporeni',
    'spor',
  ],
  radar: ['radar', 'foto radar', 'brzinomer', 'brzomjer', 'kontrola brzine'],
  control: [
    'kontrola',
    'validacija',
    'provjera',
    'pregled',
    'inspekcija',
    'redari',
  ],
  unknown: [],
};

/**
 * Keywords za ekstrakciju lokacije
 */
export const LOCATION_KEYWORDS = [
  'kod',
  'blizu',
  'na',
  'preko',
  'ka',
  'ulica',
  'deo',
  'bulevar',
  'cesta',
  'put',
  'autopat',
  'zona',
  'područje',
];

/**
 * Regex pattern-i za ekstrakciju vremena
 */
export const TIME_PATTERNS = [
  /u\s+(\d{1,2}):?(\d{2})?(?:\s*[hH])?/i, // "u 10:30", "u 10h", "u 10:30h"
  /oko\s+(\d{1,2}):?(\d{2})?(?:\s*[hH])?/i, // "oko 15h"
  /malo\s+pre(?:d)?\s+(\d{1,2}):?(\d{2})?(?:\s*[hH])?/i, // "malo pre 9h"
];

/**
 * Confidence thresholds za parser
 */
export const CONFIDENCE_THRESHOLDS = {
  EVENT_TYPE_KEYWORD: 0.3,
  LOCATION_KEYWORD: 0.2,
  TIME_EXPRESSION: 0.15,
  KNOWN_PATTERN: 0.15,
  MULTIPLE_SIGNALS: 0.1,
  MIN_FOR_PARSED: 0.5,
};
