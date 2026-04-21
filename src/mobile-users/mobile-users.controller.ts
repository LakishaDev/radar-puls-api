import { Body, Controller, Headers, Ip, Post } from '@nestjs/common';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { MobileUsersService } from './mobile-users.service';
import { ReferralsService } from '../referrals/referrals.service';

@Controller('/api/mobile-users')
export class MobileUsersController {
  constructor(
    private readonly service: MobileUsersService,
    private readonly referralsService: ReferralsService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDeviceDto,
    @Ip() ip: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ): Promise<{ userId: string; deviceUuid: string }> {
    const clientIp = forwardedFor?.split(',')[0]?.trim() ?? ip;
    const user = await this.service.upsertDevice(dto, clientIp);

    if (dto.referralCode) {
      try {
        await this.referralsService.attach({
          deviceUuid: dto.deviceUuid,
          code: dto.referralCode,
          ip: clientIp,
        });
      } catch {
        // referral attachment is best-effort; don't fail registration
      }
    }

    return { userId: user.id, deviceUuid: user.deviceUuid };
  }
}
