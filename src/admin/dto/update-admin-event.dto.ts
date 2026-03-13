import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

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
