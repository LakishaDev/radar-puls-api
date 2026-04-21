import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobileUserEntity } from './mobile-user.entity';
import { MobileUsersController } from './mobile-users.controller';
import { MobileUsersService } from './mobile-users.service';

@Module({
  imports: [TypeOrmModule.forFeature([MobileUserEntity])],
  controllers: [MobileUsersController],
  providers: [MobileUsersService],
  exports: [MobileUsersService],
})
export class MobileUsersModule {}
