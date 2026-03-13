import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminAuthGuard } from "./admin-auth.guard";
import { DeviceAuthGuard } from "./device-auth.guard";
import { DeviceTokenService } from "./device-token.service";

@Module({
  imports: [ConfigModule],
  providers: [DeviceAuthGuard, DeviceTokenService, AdminAuthGuard],
  exports: [DeviceAuthGuard, DeviceTokenService, AdminAuthGuard],
})
export class AuthModule {}
