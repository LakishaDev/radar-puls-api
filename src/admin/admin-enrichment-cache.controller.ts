import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AdminEnrichmentCacheService } from "./admin-enrichment-cache.service";
import {
  EnrichmentCacheListQueryDto,
  UpdateEnrichmentCacheEntryDto,
} from "./dto/enrichment-cache.dto";

@Controller("/api/admin/enrichment-cache")
@UseGuards(AdminAuthGuard)
export class AdminEnrichmentCacheController {
  constructor(private readonly service: AdminEnrichmentCacheService) {}

  @Get()
  async list(@Query() query: EnrichmentCacheListQueryDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateEnrichmentCacheEntryDto,
  ): Promise<{ id: string }> {
    return this.service.update(id, body);
  }

  @Delete(":id")
  async delete(@Param("id") id: string): Promise<{ deleted: boolean }> {
    return this.service.delete(id);
  }
}
