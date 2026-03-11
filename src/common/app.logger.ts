import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class AppLogger {
  private readonly logger = new Logger("RadarPulsApi");

  info(message: string, metadata: Record<string, unknown> = {}): void {
    this.logger.log(JSON.stringify({ level: "info", message, ...metadata }));
  }

  warn(message: string, metadata: Record<string, unknown> = {}): void {
    this.logger.warn(JSON.stringify({ level: "warn", message, ...metadata }));
  }

  error(message: string, metadata: Record<string, unknown> = {}): void {
    this.logger.error(JSON.stringify({ level: "error", message, ...metadata }));
  }
}
