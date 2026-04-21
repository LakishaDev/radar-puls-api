import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MobileUsersService } from '../mobile-users/mobile-users.service';
import { CodeGeneratorService } from './code-generator.service';
import { FraudCheckService } from './fraud-check.service';
import { ReferralEntity } from './referral.entity';

export interface ReferralProfileDto {
  code: string;
  shareUrl: string;
  totalInvited: number;
  qualifiedInvited: number;
  points: number;
  claimedEmail?: string;
}

export interface ReferralEntryDto {
  id: string;
  status: string;
  attachedAt: Date;
  qualifiedAt?: Date;
}

@Injectable()
export class ReferralsService {
  private readonly shareBaseUrl = 'https://radarpuls.com/invite';

  constructor(
    @InjectRepository(ReferralEntity)
    private readonly repo: Repository<ReferralEntity>,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly fraudCheck: FraudCheckService,
    private readonly mobileUsers: MobileUsersService,
  ) {}

  async getProfile(deviceUuid: string): Promise<ReferralProfileDto> {
    const user = await this.mobileUsers.findByDeviceUuid(deviceUuid);
    if (!user) throw new NotFoundException('User not found');

    const codeEntity = await this.codeGenerator.getOrCreateCode(user.id);
    const referrals = await this.repo.find({ where: { referrerUserId: user.id } });

    return {
      code: codeEntity.code,
      shareUrl: `${this.shareBaseUrl}/${codeEntity.code}`,
      totalInvited: referrals.length,
      qualifiedInvited: referrals.filter((r) => r.status === 'qualified').length,
      points: user.points,
      claimedEmail: user.email,
    };
  }

  async attach(params: {
    deviceUuid: string;
    code: string;
    ip?: string;
  }): Promise<void> {
    const { deviceUuid, code, ip } = params;
    const invitee = await this.mobileUsers.findByDeviceUuid(deviceUuid);
    if (!invitee) throw new NotFoundException('User not found');

    const codeEntity = await this.codeGenerator.findByCode(code);
    if (!codeEntity) throw new BadRequestException('Invalid referral code');

    const check = await this.fraudCheck.check({
      referrerUserId: codeEntity.userId,
      inviteeUserId: invitee.id,
      inviteeDeviceUuid: deviceUuid,
      inviteeIp: ip,
    });

    const referral = this.repo.create({
      referrerUserId: codeEntity.userId,
      inviteeUserId: invitee.id,
      inviteeDeviceUuid: deviceUuid,
      inviteeIp: ip,
      status: check.allowed ? 'pending' : 'rejected_fraud',
      rejectionReason: check.reason,
    });

    await this.repo.save(referral);

    if (!check.allowed) {
      throw new BadRequestException(check.reason ?? 'Referral not allowed');
    }
  }

  async getHistory(deviceUuid: string): Promise<ReferralEntryDto[]> {
    const user = await this.mobileUsers.findByDeviceUuid(deviceUuid);
    if (!user) throw new NotFoundException('User not found');

    const referrals = await this.repo.find({
      where: { referrerUserId: user.id },
      order: { attachedAt: 'DESC' },
    });

    return referrals.map((r) => ({
      id: r.id,
      status: r.status,
      attachedAt: r.attachedAt,
      qualifiedAt: r.qualifiedAt,
    }));
  }

  async qualifyReferral(inviteeDeviceUuid: string): Promise<void> {
    const referral = await this.repo.findOne({
      where: { inviteeDeviceUuid, status: 'pending' },
    });
    if (!referral) return;

    const windowDays = 7;
    const cutoff = new Date(
      referral.attachedAt.getTime() - windowDays * 24 * 60 * 60 * 1000,
    );
    if (new Date() < cutoff) return;

    referral.status = 'qualified';
    referral.qualifiedAt = new Date();
    await this.repo.save(referral);
    await this.mobileUsers.addPoints(referral.referrerUserId, 1);
  }
}
