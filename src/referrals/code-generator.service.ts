import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferralCodeEntity } from './referral-code.entity';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 7;

@Injectable()
export class CodeGeneratorService {
  constructor(
    @InjectRepository(ReferralCodeEntity)
    private readonly repo: Repository<ReferralCodeEntity>,
  ) {}

  async getOrCreateCode(userId: string): Promise<ReferralCodeEntity> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) return existing;

    let code: string;
    let attempts = 0;
    do {
      code = this.generateCode();
      attempts++;
      if (attempts > 20) throw new Error('Could not generate unique referral code');
    } while (await this.repo.findOne({ where: { code } }));

    const entity = this.repo.create({ userId, code });
    return this.repo.save(entity);
  }

  async findByCode(code: string): Promise<ReferralCodeEntity | null> {
    return this.repo.findOne({ where: { code: code.toUpperCase() } });
  }

  private generateCode(): string {
    let result = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      result += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return result;
  }
}
