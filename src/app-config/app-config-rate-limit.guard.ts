import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Request } from "express";

type TimestampBucket = number[];

@Injectable()
export class AppConfigRateLimitGuard implements CanActivate {
  private readonly maxRequests = 30;
  private readonly windowMs = 60_000;
  private readonly maxTrackedClients = 2000;
  private readonly buckets = new Map<string, TimestampBucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientId = this.resolveClientId(request);
    const now = Date.now();

    const current = this.buckets.get(clientId) ?? [];
    const active = current.filter((ts) => now - ts < this.windowMs);

    if (active.length >= this.maxRequests) {
      throw new HttpException("Rate limited", HttpStatus.TOO_MANY_REQUESTS);
    }

    active.push(now);
    this.buckets.set(clientId, active);

    if (this.buckets.size > this.maxTrackedClients) {
      this.compact(now);
    }

    return true;
  }

  private resolveClientId(request: Request): string {
    const forwardedFor = request.header("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      if (firstIp) {
        return firstIp;
      }
    }

    return request.ip || "unknown";
  }

  private compact(now: number): void {
    for (const [clientId, timestamps] of this.buckets.entries()) {
      const active = timestamps.filter((ts) => now - ts < this.windowMs);
      if (active.length === 0) {
        this.buckets.delete(clientId);
        continue;
      }

      this.buckets.set(clientId, active);
    }
  }
}
