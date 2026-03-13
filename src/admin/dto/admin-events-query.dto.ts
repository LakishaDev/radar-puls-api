import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class AdminEventsQueryDto {
  @IsOptional()
  @IsIn(["auto_approved", "pending_review", "approved", "rejected"])
  status?: "auto_approved" | "pending_review" | "approved" | "rejected";

  @IsOptional()
  @IsIn(["police", "accident", "traffic_jam", "radar", "control", "unknown"])
  eventType?:
    | "police"
    | "accident"
    | "traffic_jam"
    | "radar"
    | "control"
    | "unknown";

  @IsOptional()
  @IsIn(["parsed", "no_match", "partial"])
  parseStatus?: "parsed" | "no_match" | "partial";

  @IsOptional()
  @IsIn(["pending", "enriched", "failed"])
  enrichStatus?: "pending" | "enriched" | "failed";

  @IsOptional()
  @IsISO8601()
  since?: string;

  @IsOptional()
  @IsISO8601()
  until?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
