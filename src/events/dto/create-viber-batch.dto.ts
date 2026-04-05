import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class ViberBatchMessageDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sender_name?: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}:\d{2}$/)
  message_time?: string;

  @IsOptional()
  @IsISO8601()
  timestamp?: string;
}

export class CreateViberBatchDto {
  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsString()
  @IsNotEmpty()
  group!: string;

  @IsString()
  @IsNotEmpty()
  device_id!: string;

  @IsOptional()
  @IsISO8601()
  timestamp?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ViberBatchMessageDto)
  messages!: ViberBatchMessageDto[];
}
