import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AttachReferralDto } from './dto/attach-referral.dto';
import { ReferralEntryDto, ReferralProfileDto, ReferralsService } from './referrals.service';

@Controller('/api/referrals')
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  @Get('me')
  async getProfile(
    @Headers('x-device-id') deviceId?: string,
  ): Promise<ReferralProfileDto> {
    if (!deviceId) throw new UnauthorizedException('X-Device-Id required');
    return this.service.getProfile(deviceId);
  }

  @Post('attach')
  async attach(
    @Body() dto: AttachReferralDto,
    @Headers('x-device-id') deviceId?: string,
    @Ip() ip?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ): Promise<{ status: string }> {
    if (!deviceId) throw new UnauthorizedException('X-Device-Id required');
    const clientIp = forwardedFor?.split(',')[0]?.trim() ?? ip;
    await this.service.attach({ deviceUuid: deviceId, code: dto.code, ip: clientIp });
    return { status: 'attached' };
  }

  @Get('me/history')
  async getHistory(
    @Headers('x-device-id') deviceId?: string,
  ): Promise<ReferralEntryDto[]> {
    if (!deviceId) throw new UnauthorizedException('X-Device-Id required');
    return this.service.getHistory(deviceId);
  }
}
