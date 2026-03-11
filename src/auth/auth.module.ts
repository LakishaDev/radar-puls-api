import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DeviceAuthGuard } from "./device-auth.guard";
import { DeviceTokenService } from "./device-token.service";

@Module({
  imports: [ConfigModule],
  providers: [DeviceAuthGuard, DeviceTokenService],
  exports: [DeviceAuthGuard, DeviceTokenService],
})
export class AuthModule {}
