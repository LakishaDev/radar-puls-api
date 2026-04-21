import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferralEntity } from './referral.entity';

@Injectable()
export class FraudCheckService {
  constructor(
    @InjectRepository(ReferralEntity)
    private readonly repo: Repository<ReferralEntity>,
  ) {}

  async check(params: {
    referrerUserId: string;
    inviteeUserId: string;
    inviteeDeviceUuid: string;
    inviteeIp?: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const { referrerUserId, inviteeUserId, inviteeDeviceUuid } = params;

    if (referrerUserId === inviteeUserId) {
      return { allowed: false, reason: 'self_referral' };
    }

    const existingInvitee = await this.repo.findOne({ where: { inviteeUserId } });
    if (existingInvitee) {
      return { allowed: false, reason: 'already_invited' };
    }

    const sameDevice = await this.repo.findOne({
      where: { inviteeDeviceUuid, referrerUserId },
    });
    if (sameDevice) {
      return { allowed: false, reason: 'device_reuse' };
    }

    return { allowed: true };
  }
}
