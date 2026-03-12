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
export class ProcessingBackfillGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const enabled = (this.configService.get<string>("ENABLE_BACKFILL") ?? "false") === "true";

    if (!enabled) {
      throw new NotFoundException();
    }

    const expectedToken = this.configService.get<string>("BACKFILL_TRIGGER_TOKEN");
    if (!expectedToken) {
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.header("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token || token !== expectedToken) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
