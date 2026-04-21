import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MobileUserEntity } from './mobile-user.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class MobileUsersService {
  constructor(
    @InjectRepository(MobileUserEntity)
    private readonly repo: Repository<MobileUserEntity>,
  ) {}

  async upsertDevice(dto: RegisterDeviceDto, ip?: string): Promise<MobileUserEntity> {
    void ip;
    let user = await this.repo.findOne({ where: { deviceUuid: dto.deviceUuid } });

    if (!user) {
      user = this.repo.create({
        deviceUuid: dto.deviceUuid,
        platform: dto.platform,
        appVersion: dto.appVersion,
        fcmToken: dto.fcmToken,
        lastSeenAt: new Date(),
      });
    } else {
      if (dto.platform) user.platform = dto.platform;
      if (dto.appVersion) user.appVersion = dto.appVersion;
      if (dto.fcmToken) user.fcmToken = dto.fcmToken;
      user.lastSeenAt = new Date();
    }

    return this.repo.save(user);
  }

  async findByDeviceUuid(deviceUuid: string): Promise<MobileUserEntity | null> {
    return this.repo.findOne({ where: { deviceUuid } });
  }

  async findById(id: string): Promise<MobileUserEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async addPoints(userId: string, points: number): Promise<void> {
    await this.repo.increment({ id: userId }, 'points', points);
  }
}
