import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AdminService } from "./admin.service";
import { AdminEventsQueryDto } from "./dto/admin-events-query.dto";
import {
  AdminBatchReEnrichDto,
  AdminModerationActionDto,
  UpdateAdminEventDto,
} from "./dto/update-admin-event.dto";

@Controller("/api/admin")
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("/events")
  async listEvents(@Query() query: AdminEventsQueryDto): Promise<unknown> {
    return this.adminService.listEvents(query);
  }

  @Get("/events/:id")
  async getEventById(@Param("id") id: string): Promise<unknown> {
    return this.adminService.getEventById(id);
  }

  @Patch("/events/:id")
  async updateEvent(
    @Param("id") id: string,
    @Body() body: UpdateAdminEventDto,
  ): Promise<{ id: string }> {
    return this.adminService.updateEvent(id, body);
  }

  @Post("/events/:id/approve")
  async approveEvent(
    @Param("id") id: string,
    @Body() body: AdminModerationActionDto,
  ): Promise<{ id: string; moderation_status: string }> {
    return this.adminService.approveEvent(id, body);
  }

  @Post("/events/:id/reject")
  async rejectEvent(
    @Param("id") id: string,
    @Body() body: AdminModerationActionDto,
  ): Promise<{ id: string; moderation_status: string }> {
    return this.adminService.rejectEvent(id, body);
  }

  @Get("/stats")
  async getStats(): Promise<unknown> {
    return this.adminService.getStats();
  }

  @Post("/events/:id/re-enrich")
  async reEnrichEvent(
    @Param("id") id: string,
  ): Promise<{ id: string; enrich_status: string }> {
    return this.adminService.reEnrichEvent(id);
  }

  @Post("/events/re-enrich-batch")
  async reEnrichBatch(
    @Body() body: AdminBatchReEnrichDto,
  ): Promise<{ updated: number }> {
    return this.adminService.reEnrichBatch(body);
  }
}
