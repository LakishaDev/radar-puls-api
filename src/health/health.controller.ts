import { Controller, Get } from "@nestjs/common";

@Controller("/api/health")
export class HealthController {
  @Get("/")
  getHealth(): { status: string; timestamp: string } {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
