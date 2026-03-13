import { Type } from "class-transformer";
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreatePublicReportDto {
  @IsIn(["police", "accident", "traffic_jam", "radar", "control", "unknown"])
  eventType!:
    | "police"
    | "accident"
    | "traffic_jam"
    | "radar"
    | "control"
    | "unknown";

  @IsString()
  @MaxLength(250)
  locationText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  recaptchaToken?: string;
}
