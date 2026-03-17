import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AdminLocationAliasesService } from "./admin-location-aliases.service";
import { AliasListQueryDto, CreateAliasDto } from "./dto/location-alias.dto";

@Controller("/api/admin/location-aliases")
@UseGuards(AdminAuthGuard)
export class AdminLocationAliasesController {
  constructor(private readonly service: AdminLocationAliasesService) {}

  @Get()
  async list(@Query() query: AliasListQueryDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Post()
  async create(@Body() body: CreateAliasDto): Promise<{ id: string }> {
    return this.service.create(body);
  }

  @Delete(":id")
  async delete(@Param("id") id: string): Promise<{ deleted: boolean }> {
    return this.service.delete(id);
  }
}
