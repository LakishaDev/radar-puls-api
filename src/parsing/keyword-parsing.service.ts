import { Injectable } from "@nestjs/common";
import { EventType } from "./types";

type KeywordMatch = {
  eventType: EventType;
  confidence: number;
};

@Injectable()
export class KeywordParsingService {
  private readonly patterns: Array<{
    eventType: EventType;
    pattern: RegExp;
    confidence: number;
  }> = [
    {
      eventType: "control",
      pattern:
        /\b(duvaljka|alkotest|pus[eu]|zaustavljaj(u|u nas)?|kontrola)\b/iu,
      confidence: 80,
    },
    {
      eventType: "police",
      pattern: /\b(murija|policija|mup|saobra[cć]ajci|patrola|panduri?)\b/iu,
      confidence: 78,
    },
    {
      eventType: "radar",
      pattern: /\b(radar|laser|meren(j|je)|brzin(a|e))\b/iu,
      confidence: 85,
    },
    {
      eventType: "traffic_jam",
      pattern: /\b(gu[zž]va|kolona|stoji|kolaps|zastoj)\b/iu,
      confidence: 76,
    },
    {
      eventType: "accident",
      pattern: /\b(sudar|udes|cukanje|pao|oboren|prevrnuo)\b/iu,
      confidence: 74,
    },
  ];

  detectEventType(text: string): KeywordMatch | null {
    const normalized = text.trim();
    if (normalized.length < 3) {
      return null;
    }

    const hit = this.patterns.find((entry) => entry.pattern.test(normalized));
    if (!hit) {
      return null;
    }

    return {
      eventType: hit.eventType,
      confidence: hit.confidence,
    };
  }
}
