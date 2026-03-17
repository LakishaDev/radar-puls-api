import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ConfirmLocationDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  locationText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  confirmedBy?: string;
}
