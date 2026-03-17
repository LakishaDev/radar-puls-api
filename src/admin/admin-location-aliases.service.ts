import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LocationAliasEntity } from "../database/location-alias.entity";
import { normalizeText } from "../geocoding/geocoding.service";
import { AdminActivityLogService } from "./admin-activity-log.service";
import { AliasListQueryDto, CreateAliasDto } from "./dto/location-alias.dto";

@Injectable()
export class AdminLocationAliasesService {
  constructor(
    @InjectRepository(LocationAliasEntity)
    private readonly aliasRepository: Repository<LocationAliasEntity>,
    private readonly activityLog: AdminActivityLogService,
  ) {}

  async list(query: AliasListQueryDto): Promise<{
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
      where.push(`(alias_text ILIKE $${params.length} OR target_location_text ILIKE $${params.length})`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = (await this.aliasRepository.query(
      `SELECT COUNT(*)::int AS total FROM location_aliases ${whereSql}`,
      params,
    )) as Array<{ total: number }>;

    const listParams = [...params, limit, offset];
    const rows = await this.aliasRepository.query(
      `
      SELECT id, alias_text, normalized_alias, target_location_text, target_lat, target_lng, created_by, created_at
      FROM location_aliases
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
      `,
      listParams,
    );

    return { items: rows, page, limit, total: countRows[0]?.total ?? 0 };
  }

  async create(dto: CreateAliasDto): Promise<{ id: string }> {
    const normalizedAlias = normalizeText(dto.aliasText);
    if (!normalizedAlias) {
      throw new ConflictException("Alias text is empty after normalization");
    }

    try {
      const createResult = await this.aliasRepository.query(
        `
        INSERT INTO location_aliases (alias_text, normalized_alias, target_location_text, target_lat, target_lng, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [
          dto.aliasText,
          normalizedAlias,
          dto.targetLocationText,
          dto.targetLat,
          dto.targetLng,
          dto.createdBy ?? "admin",
        ],
      );
      const rows = this.extractRows<{ id: string }>(createResult);

      await this.activityLog.log({
        targetType: "alias",
        action: "alias_create",
        performedBy: dto.createdBy ?? "admin",
        newValues: {
          id: rows[0]?.id ?? null,
          aliasText: dto.aliasText,
          normalizedAlias,
          targetLocationText: dto.targetLocationText,
          targetLat: dto.targetLat,
          targetLng: dto.targetLng,
        },
      });

      return { id: rows[0].id };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.toLowerCase().includes("unique")) {
        throw new ConflictException(`Alias \"${dto.aliasText}\" already exists`);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const deleteResult = await this.aliasRepository.query(
      `
      DELETE FROM location_aliases
      WHERE id = $1
      RETURNING id, alias_text, normalized_alias, target_location_text, target_lat, target_lng
      `,
      [id],
    );
    const rows = this.extractRows<Record<string, unknown>>(deleteResult);
    if (rows.length === 0) {
      throw new NotFoundException("Alias not found");
    }

    await this.activityLog.log({
      targetType: "alias",
      action: "alias_delete",
      oldValues: rows[0] as Record<string, unknown>,
      note: `alias_id:${id}`,
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
