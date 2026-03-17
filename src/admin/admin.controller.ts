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
import { BulkConfirmLocationDto } from "./dto/bulk-confirm-location.dto";
import { ConfirmLocationDto } from "./dto/confirm-location.dto";
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

  @Get("/events/confirm-location-candidates")
  async getConfirmLocationCandidates(): Promise<unknown> {
    return this.adminService.getConfirmLocationCandidates();
  }

  @Post("/events/bulk-confirm-location")
  async bulkConfirmLocation(
    @Body() body: BulkConfirmLocationDto,
  ): Promise<{ confirmed: number; cached: number }> {
    return this.adminService.bulkConfirmLocation(body);
  }

  @Get("/activity-log")
  async getRecentActivityLog(@Query("limit") limit?: string): Promise<unknown> {
    const parsed = Number(limit);
    return this.adminService.getRecentActivityLog(
      Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50,
    );
  }

  @Patch("/events/:id")
  async updateEvent(
    @Param("id") id: string,
    @Body() body: UpdateAdminEventDto,
  ): Promise<{ id: string; edit_source: string }> {
    return this.adminService.updateEvent(id, body);
  }

  @Post("/events/:id/confirm-location")
  async confirmLocation(
    @Param("id") id: string,
    @Body() body: ConfirmLocationDto,
  ): Promise<{ id: string; cached: boolean }> {
    return this.adminService.confirmLocation(id, body);
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

  @Post("/events/:id/restore")
  async restoreEvent(
    @Param("id") id: string,
    @Body() body: AdminModerationActionDto,
  ): Promise<{ id: string; moderation_status: string }> {
    return this.adminService.restoreEvent(id, body);
  }

  @Get("/stats")
  async getStats(): Promise<unknown> {
    return this.adminService.getStats();
  }

  @Get("/events/:id/activity-log")
  async getEventActivityLog(@Param("id") id: string): Promise<unknown> {
    return this.adminService.getEventActivityLog(id);
  }

  @Get("/events/:id")
  async getEventById(@Param("id") id: string): Promise<unknown> {
    return this.adminService.getEventById(id);
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
