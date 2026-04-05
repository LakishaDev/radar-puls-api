import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EnrichmentCacheEntity } from "../database/enrichment-cache.entity";
import { AdminActivityLogService } from "./admin-activity-log.service";
import {
  EnrichmentCacheListQueryDto,
  UpdateEnrichmentCacheEntryDto,
} from "./dto/enrichment-cache.dto";

@Injectable()
export class AdminEnrichmentCacheService {
  constructor(
    @InjectRepository(EnrichmentCacheEntity)
    private readonly cacheRepository: Repository<EnrichmentCacheEntity>,
    private readonly activityLog: AdminActivityLogService,
  ) {}

  async list(query: EnrichmentCacheListQueryDto): Promise<{
    items: unknown[];
    page: number;
    limit: number;
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    const where: string[] = [];

    if (query.search && query.search.trim().length > 0) {
      params.push(`%${query.search.trim()}%`);
      where.push(
        `(normalized_text ILIKE $${params.length} OR location_text ILIKE $${params.length} OR event_type ILIKE $${params.length})`,
      );
    }

    if (query.verified === "true") {
      where.push("verified = true");
    } else if (query.verified === "false") {
      where.push("verified = false");
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = (await this.cacheRepository.query(
      `SELECT COUNT(*)::int AS total FROM enrichment_cache ${whereSql}`,
      params,
    )) as Array<{ total: number }>;

    const listRows = (await this.cacheRepository.query(
      `
      SELECT id, normalized_text, event_type, location_text, confidence, hit_count, verified, source, created_at, updated_at
      FROM enrichment_cache
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
      `,
      [...params, limit, offset],
    )) as unknown[];

    return {
      items: listRows,
      page,
      limit,
      total: countRows[0]?.total ?? 0,
    };
  }

  async update(
    id: string,
    dto: UpdateEnrichmentCacheEntryDto,
  ): Promise<{ id: string }> {
    const beforeRows = (await this.cacheRepository.query(
      `
      SELECT id, normalized_text, event_type, location_text, confidence, hit_count, verified, source
      FROM enrichment_cache
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    )) as Array<Record<string, unknown>>;

    if (beforeRows.length === 0) {
      throw new NotFoundException("Cache entry not found");
    }

    const updates: string[] = [];
    const params: unknown[] = [id];

    if (dto.eventType !== undefined) {
      params.push(dto.eventType);
      updates.push(`event_type = $${params.length}`);
    }
    if (dto.locationText !== undefined) {
      params.push(dto.locationText);
      updates.push(`location_text = $${params.length}`);
    }
    if (dto.confidence !== undefined) {
      params.push(dto.confidence);
      updates.push(`confidence = $${params.length}`);
    }
    if (dto.verified !== undefined) {
      params.push(dto.verified);
      updates.push(`verified = $${params.length}`);
    }

    if (updates.length === 0) {
      throw new BadRequestException("No fields provided for update");
    }

    await this.cacheRepository.query(
      `
      UPDATE enrichment_cache
      SET ${updates.join(", ")}, updated_at = NOW()
      WHERE id = $1
      `,
      params,
    );

    const afterRows = (await this.cacheRepository.query(
      `
      SELECT id, normalized_text, event_type, location_text, confidence, hit_count, verified, source
      FROM enrichment_cache
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    )) as Array<Record<string, unknown>>;

    await this.activityLog.log({
      targetType: "cache",
      action: "cache_edit",
      oldValues: beforeRows[0] ?? null,
      newValues: afterRows[0] ?? null,
      note: `enrichment_cache_id:${id}`,
    });

    return { id };
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const rows = (await this.cacheRepository.query(
      `
      DELETE FROM enrichment_cache
      WHERE id = $1
      RETURNING id, normalized_text, event_type, location_text, confidence, verified
      `,
      [id],
    )) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      throw new NotFoundException("Cache entry not found");
    }

    await this.activityLog.log({
      targetType: "cache",
      action: "cache_delete",
      oldValues: rows[0] ?? null,
      note: `enrichment_cache_id:${id}`,
    });

    return { deleted: true };
  }
}
