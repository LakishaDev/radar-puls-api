import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GeocodingCacheEntity } from "../database/geocoding-cache.entity";
import { normalizeText } from "../geocoding/geocoding.service";
import { AdminActivityLogService } from "./admin-activity-log.service";
import { CacheListQueryDto, UpdateCacheEntryDto } from "./dto/geocoding-cache.dto";

@Injectable()
export class AdminGeocodingCacheService {
  constructor(
    @InjectRepository(GeocodingCacheEntity)
    private readonly cacheRepository: Repository<GeocodingCacheEntity>,
    private readonly activityLog: AdminActivityLogService,
  ) {}

  async list(query: CacheListQueryDto): Promise<{
    items: unknown[];
    page: number;
    limit: number;
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const sortBy = query.sortBy ?? "updated_at";
    const sortOrder = (query.sortOrder ?? "desc").toUpperCase();

    const allowedSortColumns = ["hit_count", "created_at", "updated_at", "location_text"];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : "updated_at";
    const safeSortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

    const params: unknown[] = [];
    const where: string[] = [];

    if (query.search && query.search.trim().length > 0) {
      params.push(`%${query.search.trim()}%`);
      where.push(
        `(location_text ILIKE $${params.length} OR normalized_text ILIKE $${params.length} OR formatted_addr ILIKE $${params.length})`,
      );
    }
    if (query.verified === "true") {
      where.push("verified = true");
    } else if (query.verified === "false") {
      where.push("verified = false");
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await this.cacheRepository.query(
      `SELECT COUNT(*)::int AS total FROM geocoding_cache ${whereSql}`,
      params,
    );
    const countRows = this.extractRows<{ total: number }>(countResult);

    const listParams = [...params, limit, offset];
    const rows = await this.cacheRepository.query(
      `
      SELECT id, location_text, normalized_text, lat, lng, is_partial, location_type,
             formatted_addr, place_id, hit_count, verified, created_at, updated_at
      FROM geocoding_cache
      ${whereSql}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
      `,
      listParams,
    );

    return { items: rows, page, limit, total: countRows[0]?.total ?? 0 };
  }

  async getById(id: string): Promise<unknown> {
    const rows = await this.cacheRepository.query(
      `
      SELECT id, location_text, normalized_text, lat, lng, is_partial, location_type,
             formatted_addr, place_id, hit_count, verified, created_at, updated_at
      FROM geocoding_cache
      WHERE id = $1
      `,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException("Cache entry not found");
    }

    return rows[0];
  }

  async update(id: string, dto: UpdateCacheEntryDto): Promise<{ id: string }> {
    const oldResult = await this.cacheRepository.query(
      `
      SELECT id, lat, lng, location_text, normalized_text, verified, formatted_addr
      FROM geocoding_cache
      WHERE id = $1
      `,
      [id],
    );
    const oldRows = this.extractRows<Record<string, unknown>>(oldResult);

    if (oldRows.length === 0) {
      throw new NotFoundException("Cache entry not found");
    }

    const updates: string[] = [];
    const params: unknown[] = [id];

    if (dto.lat !== undefined) {
      params.push(dto.lat);
      updates.push(`lat = $${params.length}`);
    }
    if (dto.lng !== undefined) {
      params.push(dto.lng);
      updates.push(`lng = $${params.length}`);
    }
    if (dto.locationText !== undefined) {
      params.push(dto.locationText);
      updates.push(`location_text = $${params.length}`);
      params.push(normalizeText(dto.locationText));
      updates.push(`normalized_text = $${params.length}`);
    }
    if (dto.verified !== undefined) {
      params.push(dto.verified);
      updates.push(`verified = $${params.length}`);
    }
    if (dto.formattedAddr !== undefined) {
      params.push(dto.formattedAddr);
      updates.push(`formatted_addr = $${params.length}`);
    }

    if (updates.length === 0) {
      throw new BadRequestException("No fields provided for update");
    }

    await this.cacheRepository.query(
      `
      UPDATE geocoding_cache
      SET ${updates.join(", ")}, updated_at = NOW()
      WHERE id = $1
      `,
      params,
    );

    const newResult = await this.cacheRepository.query(
      `
      SELECT id, lat, lng, location_text, normalized_text, verified, formatted_addr
      FROM geocoding_cache
      WHERE id = $1
      `,
      [id],
    );
    const newRows = this.extractRows<Record<string, unknown>>(newResult);

    await this.activityLog.log({
      targetType: "cache",
      action: "cache_edit",
      oldValues: oldRows[0] ?? null,
      newValues: newRows[0] ?? null,
      note: `cache_id:${id}`,
    });

    return { id };
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const deleteResult = await this.cacheRepository.query(
      `
      DELETE FROM geocoding_cache
      WHERE id = $1
      RETURNING id, location_text, normalized_text, lat, lng, verified
      `,
      [id],
    );
    const rows = this.extractRows<Record<string, unknown>>(deleteResult);

    if (rows.length === 0) {
      throw new NotFoundException("Cache entry not found");
    }

    await this.activityLog.log({
      targetType: "cache",
      action: "cache_delete",
      oldValues: rows[0] as Record<string, unknown>,
      note: `cache_id:${id}`,
    });

    return { deleted: true };
  }

  private extractRows<T>(result: unknown): T[] {
    if (!Array.isArray(result)) {
      return [];
    }

    if (
      result.length === 2 &&
      Array.isArray(result[0]) &&
      typeof result[1] === "number"
    ) {
      return result[0] as T[];
    }

    return result as T[];
  }
}
