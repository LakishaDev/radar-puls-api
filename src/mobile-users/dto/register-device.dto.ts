import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MaxLength(64)
  deviceUuid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  referralCode?: string;
}
