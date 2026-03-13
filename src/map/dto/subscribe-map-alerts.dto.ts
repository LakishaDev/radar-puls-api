import { Type } from "class-transformer";
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

class PushSubscriptionKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class SubscribeMapAlertsDto {
  @IsUrl({ require_tld: false })
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

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
}

export class UnsubscribeMapAlertsDto {
  @IsUrl({ require_tld: false })
  endpoint!: string;
}
