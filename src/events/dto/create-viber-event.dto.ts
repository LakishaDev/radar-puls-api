import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class CreateViberEventDto {
  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsString()
  @IsNotEmpty()
  group!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sender_name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}:\d{2}$/)
  message_time?: string;

  @IsString()
  @IsNotEmpty()
  @IsISO8601()
  timestamp!: string;

  @IsString()
  @IsNotEmpty()
  device_id!: string;
}
