import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobileUserEntity } from './mobile-user.entity';
import { MobileUsersController } from './mobile-users.controller';
import { MobileUsersService } from './mobile-users.service';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MobileUserEntity]),
    forwardRef(() => ReferralsModule),
  ],
  controllers: [MobileUsersController],
  providers: [MobileUsersService],
  exports: [MobileUsersService],
})
export class MobileUsersModule {}
