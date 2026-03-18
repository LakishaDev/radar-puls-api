import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class RegisterMobilePushDto {
  @IsString()
  @MaxLength(512)
  fcmToken!: string;

  @IsIn(["android", "ios"])
  platform!: "android" | "ios";

  @IsString()
  @MaxLength(64)
  deviceId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  zoneLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  zoneLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(300)
  @Max(100000)
  radiusMeters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;
}

export class UnregisterMobilePushDto {
  @IsString()
  @MaxLength(512)
  fcmToken!: string;
}