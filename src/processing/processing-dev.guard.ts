import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

@Injectable()
export class ProcessingDevGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const nodeEnv = this.configService.get<string>("NODE_ENV") ?? "development";
    const enabled =
      (this.configService.get<string>("ENABLE_DEV_PROCESSING_TRIGGER") ?? "false") ===
      "true";

    if (nodeEnv !== "development" || !enabled) {
      throw new NotFoundException();
    }

    const expectedToken = this.configService.get<string>(
      "PROCESSING_DEV_TRIGGER_TOKEN",
    );

    if (!expectedToken) {
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.header("authorization");

    if (!auth || !auth.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = auth.slice("Bearer ".length).trim();
    if (!token || token !== expectedToken) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
