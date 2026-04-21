import { IsString, Length } from 'class-validator';

export class AttachReferralDto {
  @IsString()
  @Length(4, 10)
  code!: string;
}
