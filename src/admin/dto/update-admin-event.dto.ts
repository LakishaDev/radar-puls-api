import {
  IsISO8601,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class UpdateAdminEventDto {
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
  @IsString()
  @MaxLength(250)
  locationText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  geoSource?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  confidence?: number | null;

  @IsOptional()
  @IsISO8601()
  eventTime?: string | null;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;
}

export class AdminModerationActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  moderatedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminBatchReEnrichDto {
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
  @IsIn(["pending", "enriched", "failed"])
  enrichStatus?: "pending" | "enriched" | "failed";

  @IsOptional()
  @IsString()
  since?: string;

  @IsOptional()
  @IsString()
  until?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  includeRejected?: "true" | "false";

  @IsOptional()
  @IsString()
  limit?: string;
}
