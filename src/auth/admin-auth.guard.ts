import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ header(name: string): string | undefined }>();
    const auth = request.header("authorization");

    if (!auth || !auth.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const providedToken = auth.slice("Bearer ".length).trim();
    if (!providedToken) {
      throw new UnauthorizedException();
    }

    const expectedToken = this.configService.get<string>("ADMIN_API_TOKEN")?.trim();
    if (!expectedToken) {
      throw new InternalServerErrorException("ADMIN_API_TOKEN is not configured");
    }

    if (providedToken !== expectedToken) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
