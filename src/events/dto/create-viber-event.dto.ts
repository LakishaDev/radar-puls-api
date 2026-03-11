import { IsISO8601, IsNotEmpty, IsString } from "class-validator";

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

  @IsString()
  @IsNotEmpty()
  @IsISO8601()
  timestamp!: string;

  @IsString()
  @IsNotEmpty()
  device_id!: string;
}
