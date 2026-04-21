import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobileUsersModule } from '../mobile-users/mobile-users.module';
import { CodeGeneratorService } from './code-generator.service';
import { FraudCheckService } from './fraud-check.service';
import { ReferralCodeEntity } from './referral-code.entity';
import { ReferralEntity } from './referral.entity';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralEntity, ReferralCodeEntity]),
    MobileUsersModule,
  ],
  controllers: [ReferralsController],
  providers: [ReferralsService, CodeGeneratorService, FraudCheckService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
