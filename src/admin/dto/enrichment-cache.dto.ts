import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class EnrichmentCacheListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  verified?: "true" | "false";
}

export class UpdateEnrichmentCacheEntryDto {
  @IsOptional()
  @IsString()
  @IsIn(["police", "accident", "traffic_jam", "radar", "control", "unknown"])
  eventType?: string;

  @IsOptional()
  @IsString()
  locationText?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  confidence?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  verified?: boolean;
}
