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
import { AdminGeocodingCacheService } from "./admin-geocoding-cache.service";
import { CacheListQueryDto, UpdateCacheEntryDto } from "./dto/geocoding-cache.dto";

@Controller("/api/admin/geocoding-cache")
@UseGuards(AdminAuthGuard)
export class AdminGeocodingCacheController {
  constructor(private readonly service: AdminGeocodingCacheService) {}

  @Get()
  async list(@Query() query: CacheListQueryDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Get(":id")
  async getById(@Param("id") id: string): Promise<unknown> {
    return this.service.getById(id);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateCacheEntryDto,
  ): Promise<{ id: string }> {
    return this.service.update(id, body);
  }

  @Delete(":id")
  async delete(@Param("id") id: string): Promise<{ deleted: boolean }> {
    return this.service.delete(id);
  }
}
