import { Controller, Get } from "@nestjs/common";
import { EventsService } from "../events/events.service";

@Controller("/api/stats")
export class StatsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get("/public")
  async getPublicStats(): Promise<{
    total_reports_today: number;
    total_reports_week: number;
    busiest_area: string;
    most_common_type: string;
    peak_hour: string;
    reports_by_type: Array<{ type: string; count: number }>;
    reports_by_hour: Array<{ hour: number; count: number }>;
  }> {
    return this.eventsService.getPublicStats();
  }
}
