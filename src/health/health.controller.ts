import { Controller, Get } from "@nestjs/common";
import { DataSource } from "typeorm";

@Controller("/health")
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async getHealth(): Promise<{ status: string; db: string }> {
    const db = this.dataSource.isInitialized ? "up" : "down";
    return {
      status: "ok",
      db,
    };
  }
}
