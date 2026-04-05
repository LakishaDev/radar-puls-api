import { Injectable } from "@nestjs/common";
import { EventType } from "./types";

@Injectable()
export class LocationExtractionService {
  private readonly eventKeywordPatterns: Record<EventType, RegExp | null> = {
    control:
      /\b(duvaljka|alkotest|pus[eu]|zaustavljaj(u|u nas)?|kontrola)\b/giu,
    police: /\b(murija|policija|mup|saobra[cć]ajci|patrola|panduri?)\b/giu,
    radar: /\b(radar|laser|meren(j|je)|brzin(a|e))\b/giu,
    traffic_jam: /\b(gu[zž]va|kolona|stoji|kolaps|zastoj)\b/giu,
    accident: /\b(sudar|udes|cukanje|pao|oboren|prevrnuo)\b/giu,
    unknown: null,
  };

  private readonly locationPrepositions =
    /\b(preko\s+puta|ispred|posle|blizu|pored|kod|na|iza|pre)\b/giu;

  extractLocation(text: string, eventType: EventType): string | null {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const eventPattern = this.eventKeywordPatterns[eventType];
    const withoutTypeKeywords = eventPattern
      ? trimmed.replace(eventPattern, " ")
      : trimmed;
    const withoutPrep = withoutTypeKeywords.replace(
      this.locationPrepositions,
      " ",
    );
    const collapsed = withoutPrep
      .replace(/[|,:;.!?]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (collapsed.length < 2) {
      return null;
    }

    return collapsed;
  }
}
