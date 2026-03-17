import { Type } from "class-transformer";
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateAliasDto {
  @IsString()
  @MaxLength(250)
  aliasText!: string;

  @IsString()
  @MaxLength(250)
  targetLocationText!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  targetLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  targetLng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  createdBy?: string;
}

export class AliasListQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
