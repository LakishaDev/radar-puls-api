import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class BulkConfirmLocationDto {
  @IsArray()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(100)
  eventIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  confirmedBy?: string;
}
