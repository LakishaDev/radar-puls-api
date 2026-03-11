import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class DeviceTokenService {
  private readonly tokenMap: Record<string, string>;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.getOrThrow<string>("DEVICE_TOKENS_JSON");
    const parsed = JSON.parse(raw) as Record<string, string>;
    this.tokenMap = parsed;
  }

  assertAuthorized(deviceId: string, bearerToken: string): void {
    const expected = this.tokenMap[deviceId];
    if (!expected || expected !== bearerToken) {
      throw new UnauthorizedException();
    }
  }
}
