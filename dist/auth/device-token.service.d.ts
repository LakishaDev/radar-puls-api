import { ConfigService } from '@nestjs/config';
export declare class DeviceTokenService {
    private readonly configService;
    private readonly tokenMap;
    constructor(configService: ConfigService);
    assertAuthorized(deviceId: string, bearerToken: string): void;
}
