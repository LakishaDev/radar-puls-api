# Plan: API — Napredne funkcionalnosti (Predlozi iz plana za Location Moderation)

**Datum:** 2026-03-17  
**Zavisnost:** Implementirati POSLE `plan_2026-03-17_admin-location-moderation-api.md`  
**Sinhronizovano sa:** `radar-puls-web/copilot/plans/plan_2026-03-17_advanced-admin-features-web.md`

---

## Sadržaj

1. [Admin Activity Log](#1-admin-activity-log)
2. [Bulk Confirm Location](#2-bulk-confirm-location)
3. [Geocoding Cache Admin CRUD](#3-geocoding-cache-admin-crud)
4. [Confidence Threshold za Auto-Approve lokacija](#4-confidence-threshold-za-auto-approve-lokacija)
5. [Location Aliases](#5-location-aliases)
6. [Soft Delete umesto Hard Reject](#6-soft-delete-umesto-hard-reject)

---

## 1. Admin Activity Log

### Cilj
Svaka admin akcija (approve, reject, update, confirm-location, re-enrich, itd.) se beleži u posebnu tabelu `admin_activity_log` sa starim i novim vrednostima. Služi kao audit trail i za rollback.

### 1.1 Nova migracija: `1710450000000-CreateAdminActivityLog.ts`

**Fajl:** `src/database/migrations/1710450000000-CreateAdminActivityLog.ts`

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAdminActivityLog1710450000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE admin_activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID NOT NULL REFERENCES parsed_events(id) ON DELETE CASCADE,
        action TEXT NOT NULL CHECK (action IN (
          'approve', 'reject', 'update', 'confirm_location',
          're_enrich', 'restore', 'bulk_confirm', 'cache_edit',
          'cache_delete', 'alias_create', 'alias_delete'
        )),
        performed_by TEXT NOT NULL DEFAULT 'admin',
        old_values JSONB,
        new_values JSONB,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_admin_activity_log_event_id ON admin_activity_log (event_id);
      CREATE INDEX idx_admin_activity_log_action ON admin_activity_log (action);
      CREATE INDEX idx_admin_activity_log_created_at ON admin_activity_log (created_at DESC);
      CREATE INDEX idx_admin_activity_log_performed_by ON admin_activity_log (performed_by);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS admin_activity_log;`);
  }
}
```

### 1.2 Novi entity: `src/database/admin-activity-log.entity.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ParsedEventEntity } from "./parsed-event.entity";

@Entity({ name: "admin_activity_log" })
export class AdminActivityLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "event_id" })
  eventId!: string;

  @ManyToOne(() => ParsedEventEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "event_id" })
  event?: ParsedEventEntity;

  @Column({ type: "text" })
  action!: string;

  @Column({ type: "text", name: "performed_by", default: "admin" })
  performedBy!: string;

  @Column({ type: "jsonb", name: "old_values", nullable: true })
  oldValues!: Record<string, unknown> | null;

  @Column({ type: "jsonb", name: "new_values", nullable: true })
  newValues!: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
```

### 1.3 Novi servis: `src/admin/admin-activity-log.service.ts`

```typescript
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminActivityLogEntity } from "../database/admin-activity-log.entity";

@Injectable()
export class AdminActivityLogService {
  constructor(
    @InjectRepository(AdminActivityLogEntity)
    private readonly logRepository: Repository<AdminActivityLogEntity>,
  ) {}

  async log(params: {
    eventId: string;
    action: string;
    performedBy?: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    note?: string | null;
  }): Promise<void> {
    await this.logRepository.query(
      `
      INSERT INTO admin_activity_log (event_id, action, performed_by, old_values, new_values, note)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        params.eventId,
        params.action,
        params.performedBy ?? "admin",
        params.oldValues ? JSON.stringify(params.oldValues) : null,
        params.newValues ? JSON.stringify(params.newValues) : null,
        params.note ?? null,
      ],
    );
  }

  async getLogsForEvent(eventId: string): Promise<AdminActivityLogEntity[]> {
    return this.logRepository.query(
      `
      SELECT id, event_id, action, performed_by, old_values, new_values, note, created_at
      FROM admin_activity_log
      WHERE event_id = $1
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [eventId],
    ) as Promise<AdminActivityLogEntity[]>;
  }

  async getRecentLogs(limit = 50): Promise<AdminActivityLogEntity[]> {
    return this.logRepository.query(
      `
      SELECT al.id, al.event_id, al.action, al.performed_by, al.old_values, al.new_values, al.note, al.created_at,
             pe.event_type, pe.location_text
      FROM admin_activity_log al
      LEFT JOIN parsed_events pe ON pe.id = al.event_id
      ORDER BY al.created_at DESC
      LIMIT $1
      `,
      [limit],
    ) as Promise<AdminActivityLogEntity[]>;
  }
}
```

### 1.4 Integrisati logovanje u `AdminService`

**Fajl:** `src/admin/admin.service.ts`

Dodati `AdminActivityLogService` u constructor dependency injection.

Za svaku metodu koja menja podatke — dodati poziv `this.activityLog.log(...)` POSLE uspešnog SQL-a:

**`updateEvent()`:**
```typescript
// Dohvatiti stare vrednosti PRE update-a
const oldRow = await this.parsedEventsRepository.query(
  `SELECT event_type, location_text, sender_name, description, latitude, longitude, confidence
   FROM parsed_events WHERE id = $1`, [id]
);
// ... uradi update ...
await this.activityLog.log({
  eventId: id,
  action: "update",
  oldValues: oldRow[0] ?? null,
  newValues: { eventType: dto.eventType, locationText: dto.locationText, senderName: dto.senderName, description: dto.description },
});
```

**`approveEvent()`:**
```typescript
await this.activityLog.log({
  eventId: id,
  action: "approve",
  performedBy: dto.moderatedBy ?? "admin",
  oldValues: { moderation_status: "pending_review" }, // ili dohvati prethodni
  newValues: { moderation_status: "approved" },
  note: dto.note ?? null,
});
```

**`rejectEvent()`:**
```typescript
await this.activityLog.log({
  eventId: id,
  action: "reject",
  performedBy: dto.moderatedBy ?? "admin",
  newValues: { moderation_status: "rejected" },
  note: dto.note ?? null,
});
```

**`confirmLocation()`** (iz prethodnog plana):
```typescript
await this.activityLog.log({
  eventId: id,
  action: "confirm_location",
  newValues: { latitude: lat, longitude: lng, locationText, geo_source: "admin_confirmed" },
});
```

**`reEnrichEvent()`:**
```typescript
await this.activityLog.log({
  eventId: id,
  action: "re_enrich",
  newValues: { enrich_status: "pending" },
});
```

### 1.5 Novi endpoint za dobavljanje loga

**Fajl:** `src/admin/admin.controller.ts`

```typescript
@Get("/events/:id/activity-log")
async getEventActivityLog(@Param("id") id: string): Promise<unknown> {
  return this.adminService.getEventActivityLog(id);
}

@Get("/activity-log")
async getRecentActivityLog(
  @Query("limit") limit?: string,
): Promise<unknown> {
  const parsed = Number(limit);
  return this.adminService.getRecentActivityLog(
    Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50
  );
}
```

**Fajl:** `src/admin/admin.service.ts`

```typescript
async getEventActivityLog(eventId: string): Promise<AdminActivityLogEntity[]> {
  return this.activityLog.getLogsForEvent(eventId);
}

async getRecentActivityLog(limit: number): Promise<AdminActivityLogEntity[]> {
  return this.activityLog.getRecentLogs(limit);
}
```

### 1.6 Ažurirati `admin.module.ts`

```typescript
import { AdminActivityLogEntity } from "../database/admin-activity-log.entity";
import { AdminActivityLogService } from "./admin-activity-log.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ParsedEventEntity, RawEventEntity, AdminActivityLogEntity]),
    AuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminActivityLogService],
})
export class AdminModule {}
```

---

## 2. Bulk Confirm Location

### Cilj
Endpoint koji prima listu event ID-jeva i potvrđuje lokaciju za sve odjednom. Takođe, automatski predlaže kandidate za bulk potvrdu (isti `location_text`, iste koordinate, 5+ ponavljanja).

### 2.1 Novi DTO: `src/admin/dto/bulk-confirm-location.dto.ts`

```typescript
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, ArrayMaxSize } from "class-validator";

export class BulkConfirmLocationDto {
  @IsArray()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(100)
  eventIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  confirmedBy?: string;
}
```

### 2.2 Novi endpoint-i

**Fajl:** `src/admin/admin.controller.ts`

```typescript
@Post("/events/bulk-confirm-location")
async bulkConfirmLocation(
  @Body() body: BulkConfirmLocationDto,
): Promise<{ confirmed: number; cached: number }> {
  return this.adminService.bulkConfirmLocation(body);
}

@Get("/events/confirm-location-candidates")
async getConfirmLocationCandidates(): Promise<unknown> {
  return this.adminService.getConfirmLocationCandidates();
}
```

### 2.3 Implementacija u `AdminService`

**`bulkConfirmLocation(body)`:**

```typescript
async bulkConfirmLocation(dto: BulkConfirmLocationDto): Promise<{ confirmed: number; cached: number }> {
  // 1. Dohvati sve evente po ID-jevima koji imaju lat, lng i location_text
  const events = await this.parsedEventsRepository.query(
    `
    SELECT id, location_text, latitude, longitude, geo_source
    FROM parsed_events
    WHERE id = ANY($1::uuid[])
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND location_text IS NOT NULL
    `,
    [dto.eventIds],
  );

  if (events.length === 0) {
    return { confirmed: 0, cached: 0 };
  }

  // 2. Za svaku unikatnu location_text → upsert u geocoding_cache sa verified=true
  const seen = new Set<string>();
  let cached = 0;
  for (const evt of events) {
    const normalized = normalizeText(evt.location_text); // koristiti exportovanu funkciju
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    
    await this.parsedEventsRepository.query(
      `
      INSERT INTO geocoding_cache (location_text, normalized_text, lat, lng, is_partial, location_type, verified, hit_count, created_at, updated_at)
      VALUES ($1, $2, $3, $4, false, 'ADMIN_CONFIRMED', true, 1, NOW(), NOW())
      ON CONFLICT (normalized_text)
      DO UPDATE SET
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        verified = true,
        location_type = 'ADMIN_CONFIRMED',
        hit_count = geocoding_cache.hit_count + 1,
        updated_at = NOW()
      `,
      [evt.location_text, normalized, evt.latitude, evt.longitude],
    );
    cached++;
  }

  // 3. Update sve evente: geo_source = 'admin_confirmed', edit_source = 'admin_confirmed'
  const [, confirmed] = await this.parsedEventsRepository.query(
    `
    UPDATE parsed_events
    SET
      geo_source = 'admin_confirmed',
      edit_source = 'admin_confirmed',
      moderated_by = $2,
      moderated_at = NOW(),
      updated_at = NOW()
    WHERE id = ANY($1::uuid[])
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    RETURNING id
    `,
    [dto.eventIds, dto.confirmedBy ?? "admin"],
  );

  // 4. Activity log za svaki event
  for (const evt of events) {
    await this.activityLog.log({
      eventId: evt.id,
      action: "bulk_confirm",
      performedBy: dto.confirmedBy ?? "admin",
      newValues: { geo_source: "admin_confirmed", latitude: evt.latitude, longitude: evt.longitude },
    });
  }

  return { confirmed: confirmed ?? 0, cached };
}
```

**`getConfirmLocationCandidates()`:**

```typescript
async getConfirmLocationCandidates(): Promise<unknown[]> {
  // Nađi location_text vrednosti koje se pojavljuju 5+ puta sa istim koordinatama
  // i koje NISU verifikovane u geocoding_cache
  const rows = await this.parsedEventsRepository.query(`
    SELECT
      pe.location_text,
      ROUND(pe.latitude::numeric, 4) AS lat,
      ROUND(pe.longitude::numeric, 4) AS lng,
      pe.geo_source,
      COUNT(*)::int AS occurrence_count,
      array_agg(pe.id ORDER BY pe.created_at DESC) AS event_ids
    FROM parsed_events pe
    LEFT JOIN geocoding_cache gc
      ON gc.normalized_text = LOWER(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            TRANSLATE(pe.location_text, 'čćžšđČĆŽŠĐ', 'cczsdjCCZSD'),
            '[^a-zA-Z0-9\\s]', ' ', 'g'
          ),
          '\\s+', ' ', 'g'
        )
      )
      AND gc.verified = true
    WHERE pe.latitude IS NOT NULL
      AND pe.longitude IS NOT NULL
      AND pe.location_text IS NOT NULL
      AND pe.geo_source NOT IN ('admin', 'admin_confirmed')
      AND gc.id IS NULL
    GROUP BY pe.location_text, ROUND(pe.latitude::numeric, 4), ROUND(pe.longitude::numeric, 4), pe.geo_source
    HAVING COUNT(*) >= 5
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `);

  return rows;
}
```

**Napomena:** `normalizeText` funkcija iz `geocoding.service.ts` mora biti exportovana. Trenutno je module-level `function normalizeText(...)` — promeniti u `export function normalizeText(...)`.

**Fajl:** `src/geocoding/geocoding.service.ts` — na dnu fajla:
```typescript
// Promeniti iz:
function normalizeText(value: string): string {
// U:
export function normalizeText(value: string): string {
```

---

## 3. Geocoding Cache Admin CRUD

### Cilj
Omogućiti adminu CRUD operacije nad `geocoding_cache` tabelom: listanje, pregled, izmena, brisanje cache unosa.

### 3.1 Novi controller: `src/admin/admin-geocoding-cache.controller.ts`

```typescript
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
import { UpdateCacheEntryDto, CacheListQueryDto } from "./dto/geocoding-cache.dto";

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
```

### 3.2 Novi DTO: `src/admin/dto/geocoding-cache.dto.ts`

```typescript
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class CacheListQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  verified?: "true" | "false";

  @IsOptional()
  @IsIn(["hit_count", "created_at", "updated_at", "location_text"])
  sortBy?: "hit_count" | "created_at" | "updated_at" | "location_text";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateCacheEntryDto {
  @IsOptional()
  @IsNumber()
  @Min(-90) @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180) @Max(180)
  lng?: number;

  @IsOptional()
  @IsString()
  locationText?: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsString()
  formattedAddr?: string;
}
```

### 3.3 Novi servis: `src/admin/admin-geocoding-cache.service.ts`

```typescript
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GeocodingCacheEntity } from "../database/geocoding-cache.entity";
import { AdminActivityLogService } from "./admin-activity-log.service";
import { CacheListQueryDto, UpdateCacheEntryDto } from "./dto/geocoding-cache.dto";
import { normalizeText } from "../geocoding/geocoding.service";

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

    // Validirati sortBy i sortOrder da nisu SQL injection
    const allowedSortColumns = ["hit_count", "created_at", "updated_at", "location_text"];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : "updated_at";
    const safeSortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

    const params: unknown[] = [];
    const where: string[] = [];

    if (query.search && query.search.trim().length > 0) {
      params.push(`%${query.search.trim()}%`);
      where.push(`(location_text ILIKE $${params.length} OR normalized_text ILIKE $${params.length} OR formatted_addr ILIKE $${params.length})`);
    }
    if (query.verified === "true") {
      where.push(`verified = true`);
    } else if (query.verified === "false") {
      where.push(`verified = false`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = await this.cacheRepository.query(
      `SELECT COUNT(*)::int AS total FROM geocoding_cache ${whereSql}`,
      params,
    );
    const total = countRows[0]?.total ?? 0;

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

    return { items: rows, page, limit, total };
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
    // Dohvati stare vrednosti za activity log
    const oldRows = await this.cacheRepository.query(
      `SELECT lat, lng, location_text, verified, formatted_addr FROM geocoding_cache WHERE id = $1`,
      [id],
    );
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
      // Ažurirati i normalized_text
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

    // Activity log — event_id koristi UUID iz cache-a kao referencu
    // Budžuci da cache entry nema event_id, koristimo NULL-safe pristup
    // Napomena: Za cache edite možemo logirati sa posebnom "cache" event referencom
    // ili proširiti activity_log da event_id bude nullable. Preporuka: učiniti event_id nullable.

    return { id };
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const result = await this.cacheRepository.query(
      `DELETE FROM geocoding_cache WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.length === 0) {
      throw new NotFoundException("Cache entry not found");
    }
    return { deleted: true };
  }
}
```

### 3.4 Ažurirati migraciju za activity_log

Promeniti `event_id` kolonu u `admin_activity_log` da bude **nullable** (jer cache edit/delete nema event ID):

```sql
-- U migraciji 1710450000000:
event_id UUID REFERENCES parsed_events(id) ON DELETE CASCADE,
-- Umesto NOT NULL, sada je nullable
```

Dodati i `target_type` kolonu za razlikovanje:
```sql
target_type TEXT NOT NULL DEFAULT 'event' CHECK (target_type IN ('event', 'cache', 'alias'))
```

### 3.5 Registrovati u `admin.module.ts`

```typescript
import { GeocodingCacheEntity } from "../database/geocoding-cache.entity";
import { AdminGeocodingCacheController } from "./admin-geocoding-cache.controller";
import { AdminGeocodingCacheService } from "./admin-geocoding-cache.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ParsedEventEntity,
      RawEventEntity,
      AdminActivityLogEntity,
      GeocodingCacheEntity,
    ]),
    AuthModule,
  ],
  controllers: [AdminController, AdminGeocodingCacheController],
  providers: [AdminService, AdminActivityLogService, AdminGeocodingCacheService],
})
export class AdminModule {}
```

### 3.6 API endpoint-i rezime

| Metoda | Ruta | Opis |
|--------|------|------|
| `GET` | `/api/admin/geocoding-cache` | Lista cache unosa (search, verified filter, sortiranje, paginacija) |
| `GET` | `/api/admin/geocoding-cache/:id` | Detalji jednog cache unosa |
| `PATCH` | `/api/admin/geocoding-cache/:id` | Izmeni lat, lng, locationText, verified, formattedAddr |
| `DELETE` | `/api/admin/geocoding-cache/:id` | Obriši cache unos |

---

## 4. Confidence Threshold za Auto-Approve lokacija

### Cilj
Automatski dodati lokaciju u `geocoding_cache` kao verifikovanu kada confidence >= 90 i geo_source je `google` (ne `google_partial`). Ovo se dešava u enrichment pipeline-u.

### 4.1 Nova env varijabla

**Fajl:** `src/config/env.validation.ts`

Dodati:
```typescript
GEO_AUTO_VERIFY_ENABLED: Joi.boolean().default(false),
GEO_AUTO_VERIFY_MIN_CONFIDENCE: Joi.number().min(50).max(100).default(90),
```

### 4.2 Izmena u `EnrichmentService.enrichEvent()`

**Fajl:** `src/enrichment/enrichment.service.ts`

Posle uspešnog geocoding-a i update-a parsed_events, dodati:

```typescript
// Posle: await this.parsedEventsRepository.query(UPDATE parsed_events SET ...)
// Dodati auto-verify logiku:

const autoVerifyEnabled = this.configService.get<string>("GEO_AUTO_VERIFY_ENABLED") === "true";
const minConfidence = Number(this.configService.get("GEO_AUTO_VERIFY_MIN_CONFIDENCE") ?? 90);

if (
  autoVerifyEnabled &&
  geoResult &&
  geoResult.source === "google" &&         // Samo full match, ne partial
  !geoResult.isPartialMatch &&
  Number(structuredData.confidence) >= minConfidence &&
  structuredData.locationText
) {
  const normalized = normalizeText(structuredData.locationText);
  await this.geocodingService.markAsVerified(normalized);
  this.logger.info("geo_auto_verified", {
    eventId: event.id,
    locationText: structuredData.locationText,
    confidence: structuredData.confidence,
  });
}
```

### 4.3 Nova metoda u `GeocodingService`

**Fajl:** `src/geocoding/geocoding.service.ts`

```typescript
async markAsVerified(normalizedText: string): Promise<boolean> {
  const result = await this.cacheRepository.query(
    `
    UPDATE geocoding_cache
    SET verified = true, updated_at = NOW()
    WHERE normalized_text = $1 AND verified = false
    RETURNING id
    `,
    [normalizedText],
  );
  return (result as unknown[]).length > 0;
}
```

### 4.4 Ažurirati `.env.example`

```
GEO_AUTO_VERIFY_ENABLED=false
GEO_AUTO_VERIFY_MIN_CONFIDENCE=90
```

---

## 5. Location Aliases

### Cilj
Dozvoliti adminu da kreira aliase za lokacije. Npr. "kod kalkana", "kalkan", "kod kalkana centar" → svi mapiraju na iste koordinate (43.3203, 21.8958). Aliasi se čuvaju u novoj tabeli i konsultuju se u geocoding pipeline-u PRE Google API poziva.

### 5.1 Nova migracija: `1710460000000-CreateLocationAliases.ts`

**Fajl:** `src/database/migrations/1710460000000-CreateLocationAliases.ts`

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateLocationAliases1710460000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE location_aliases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        alias_text TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        target_location_text TEXT NOT NULL,
        target_lat DOUBLE PRECISION NOT NULL,
        target_lng DOUBLE PRECISION NOT NULL,
        created_by TEXT NOT NULL DEFAULT 'admin',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (normalized_alias)
      );

      CREATE INDEX idx_location_aliases_normalized ON location_aliases (normalized_alias);
      CREATE INDEX idx_location_aliases_target ON location_aliases (target_location_text);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS location_aliases;`);
  }
}
```

### 5.2 Novi entity: `src/database/location-alias.entity.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "location_aliases" })
export class LocationAliasEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", name: "alias_text" })
  aliasText!: string;

  @Column({ type: "text", name: "normalized_alias", unique: true })
  normalizedAlias!: string;

  @Column({ type: "text", name: "target_location_text" })
  targetLocationText!: string;

  @Column({ type: "double precision", name: "target_lat" })
  targetLat!: number;

  @Column({ type: "double precision", name: "target_lng" })
  targetLng!: number;

  @Column({ type: "text", name: "created_by", default: "admin" })
  createdBy!: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
```

### 5.3 Integrisati u `GeocodingService`

**Fajl:** `src/geocoding/geocoding.service.ts`

Dodati `LocationAliasEntity` repository u constructor:
```typescript
@InjectRepository(LocationAliasEntity)
private readonly aliasRepository: Repository<LocationAliasEntity>,
```

Nova metoda:
```typescript
private async findAlias(normalizedInput: string): Promise<GeoResult | null> {
  const rows = await this.aliasRepository.query(
    `
    SELECT target_lat, target_lng, target_location_text
    FROM location_aliases
    WHERE normalized_alias = $1
    LIMIT 1
    `,
    [normalizedInput],
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    lat: Number(rows[0].target_lat),
    lng: Number(rows[0].target_lng),
    source: "fallback",
    isPartialMatch: false,
    confidence: "high",
  };
}
```

Izmeniti `geocodeLocation()` — dodati alias proveru POSLE hardkodiranog fallback-a, PRE cache-a:

```typescript
async geocodeLocation(locationText: string): Promise<GeoResult | null> {
  const normalizedInput = normalizeText(locationText);
  if (!normalizedInput) return null;

  // 1. Hardkodirani fallback-ovi
  const fallback = this.findFallback(normalizedInput);
  if (fallback) return fallback;

  // 2. Admin definisani aliasi ← NOVO
  const alias = await this.findAlias(normalizedInput);
  if (alias) return alias;

  if (!this.geoEnabled) return null;

  // 3. Cache
  const cached = await this.findCached(normalizedInput);
  if (cached) return cached;

  // 4. Google API
  return this.geocodeWithGoogle(locationText, normalizedInput);
}
```

### 5.4 Ažurirati `geocoding.module.ts`

```typescript
import { LocationAliasEntity } from "../database/location-alias.entity";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([GeocodingCacheEntity, LocationAliasEntity])],
  providers: [GeocodingService, AppLogger],
  exports: [GeocodingService],
})
export class GeocodingModule {}
```

### 5.5 Admin endpoint-i za aliase

**Novi controller:** `src/admin/admin-location-aliases.controller.ts`

```typescript
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
import { CreateAliasDto, AliasListQueryDto } from "./dto/location-alias.dto";

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
```

### 5.6 Novi DTO: `src/admin/dto/location-alias.dto.ts`

```typescript
import { Type } from "class-transformer";
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateAliasDto {
  @IsString()
  @MaxLength(250)
  aliasText!: string;

  @IsString()
  @MaxLength(250)
  targetLocationText!: string;

  @IsNumber()
  @Min(-90) @Max(90)
  targetLat!: number;

  @IsNumber()
  @Min(-180) @Max(180)
  targetLng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  createdBy?: string;
}

export class AliasListQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

### 5.7 Novi servis: `src/admin/admin-location-aliases.service.ts`

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LocationAliasEntity } from "../database/location-alias.entity";
import { normalizeText } from "../geocoding/geocoding.service";
import { AliasListQueryDto, CreateAliasDto } from "./dto/location-alias.dto";

@Injectable()
export class AdminLocationAliasesService {
  constructor(
    @InjectRepository(LocationAliasEntity)
    private readonly aliasRepository: Repository<LocationAliasEntity>,
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

    const countRows = await this.aliasRepository.query(
      `SELECT COUNT(*)::int AS total FROM location_aliases ${whereSql}`,
      params,
    );

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
      const rows = await this.aliasRepository.query(
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
      return { id: rows[0].id };
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("unique")) {
        throw new ConflictException(`Alias "${dto.aliasText}" already exists`);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const rows = await this.aliasRepository.query(
      `DELETE FROM location_aliases WHERE id = $1 RETURNING id`,
      [id],
    );
    if (rows.length === 0) {
      throw new NotFoundException("Alias not found");
    }
    return { deleted: true };
  }
}
```

### 5.8 Registrovati u `admin.module.ts`

Dodati `LocationAliasEntity`, `AdminLocationAliasesController`, `AdminLocationAliasesService` u module.

---

## 6. Soft Delete umesto Hard Reject

### Cilj
Umesto da rejected eventi budu trajno nevidljivi, dodati mogućnost restore-a. Implementirati `hidden_at` timestamp — ako je setovan, event je skriven sa mape. Admin može da restaurira event.

### 6.1 Nova migracija: `1710470000000-AddSoftDeleteToParsedEvents.ts`

**Fajl:** `src/database/migrations/1710470000000-AddSoftDeleteToParsedEvents.ts`

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSoftDeleteToParsedEvents1710470000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE parsed_events
        ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ DEFAULT NULL;

      -- Backfill: sakri sve rejected evente
      UPDATE parsed_events
        SET hidden_at = moderated_at
        WHERE moderation_status = 'rejected' AND hidden_at IS NULL;

      CREATE INDEX idx_parsed_events_hidden_at ON parsed_events (hidden_at)
        WHERE hidden_at IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_parsed_events_hidden_at;
      ALTER TABLE parsed_events DROP COLUMN IF EXISTS hidden_at;
    `);
  }
}
```

### 6.2 Ažurirati entity

**Fajl:** `src/database/parsed-event.entity.ts`

Dodati:
```typescript
@Column({ type: "timestamptz", name: "hidden_at", nullable: true })
hiddenAt!: Date | null;
```

### 6.3 Izmeniti `AdminService.rejectEvent()`

**Fajl:** `src/admin/admin.service.ts`

Promeniti `rejectEvent()` da takođe setuje `hidden_at`:

```sql
UPDATE parsed_events
SET
  moderation_status = 'rejected',
  moderated_by = $2,
  moderated_at = NOW(),
  moderation_note = $3,
  hidden_at = NOW(),        -- ← NOVO
  updated_at = NOW()
WHERE id = $1
RETURNING id, moderation_status
```

### 6.4 Novi endpoint: Restore event

**Fajl:** `src/admin/admin.controller.ts`

```typescript
@Post("/events/:id/restore")
async restoreEvent(
  @Param("id") id: string,
  @Body() body: AdminModerationActionDto,
): Promise<{ id: string; moderation_status: string }> {
  return this.adminService.restoreEvent(id, body);
}
```

**Fajl:** `src/admin/admin.service.ts`

```typescript
async restoreEvent(
  id: string,
  dto: AdminModerationActionDto,
): Promise<{ id: string; moderation_status: string }> {
  const [rows] = (await this.parsedEventsRepository.query(
    `
    UPDATE parsed_events
    SET
      moderation_status = 'pending_review',
      hidden_at = NULL,
      moderated_by = $2,
      moderated_at = NOW(),
      moderation_note = $3,
      updated_at = NOW()
    WHERE id = $1
      AND moderation_status = 'rejected'
    RETURNING id, moderation_status
    `,
    [id, dto.moderatedBy ?? "admin", dto.note ?? "Restored by admin"],
  )) as [Array<{ id: string; moderation_status: string }>, number];

  if ((rows ?? []).length === 0) {
    throw new NotFoundException("Event not found or not in rejected state");
  }

  await this.activityLog.log({
    eventId: id,
    action: "restore",
    performedBy: dto.moderatedBy ?? "admin",
    newValues: { moderation_status: "pending_review", hidden_at: null },
    note: dto.note ?? null,
  });

  this.realtimePublisher?.publish({
    type: "report_updated",
    reportId: rows[0].id,
    payload: { id: rows[0].id, moderation_status: rows[0].moderation_status },
  });

  return rows[0];
}
```

### 6.5 Ažurirati map query-je da filter po `hidden_at`

**Fajl:** `src/events/events.service.ts`

U svim query-jima koji prikazuju evente na mapi dodati:
```sql
AND pe.hidden_at IS NULL
```

Konkretno u `getPublicMapEvents()` i `getMapEvents()` — dodati `AND pe.hidden_at IS NULL` u WHERE klauzulu.

### 6.6 Admin events lista: prikazati `hidden_at` status

U `listEvents()` SELECT dodati `pe.hidden_at`, a frontend može prikazati badge "Skriveno" za hidden evente.

---

## Kompletan pregled novih fajlova

| Fajl | Tip |
|------|-----|
| `src/database/migrations/1710450000000-CreateAdminActivityLog.ts` | Migracija |
| `src/database/migrations/1710460000000-CreateLocationAliases.ts` | Migracija |
| `src/database/migrations/1710470000000-AddSoftDeleteToParsedEvents.ts` | Migracija |
| `src/database/admin-activity-log.entity.ts` | Entity |
| `src/database/location-alias.entity.ts` | Entity |
| `src/admin/admin-activity-log.service.ts` | Servis |
| `src/admin/admin-geocoding-cache.controller.ts` | Controller |
| `src/admin/admin-geocoding-cache.service.ts` | Servis |
| `src/admin/admin-location-aliases.controller.ts` | Controller |
| `src/admin/admin-location-aliases.service.ts` | Servis |
| `src/admin/dto/bulk-confirm-location.dto.ts` | DTO |
| `src/admin/dto/geocoding-cache.dto.ts` | DTO |
| `src/admin/dto/location-alias.dto.ts` | DTO |

## Fajlovi koji se menjaju

| Fajl | Promene |
|------|---------|
| `src/admin/admin.module.ts` | Registracija svih novih entiteta, controllera, servisa |
| `src/admin/admin.controller.ts` | Novi endpoint-i: bulk-confirm, candidates, activity-log, restore |
| `src/admin/admin.service.ts` | Activity log integracija u svaku metodu, bulkConfirmLocation, restoreEvent, getConfirmLocationCandidates |
| `src/geocoding/geocoding.service.ts` | Export `normalizeText`, nova `markAsVerified()`, alias lookup u `geocodeLocation()` |
| `src/geocoding/geocoding.module.ts` | Dodati `LocationAliasEntity` |
| `src/enrichment/enrichment.service.ts` | Auto-verify logika |
| `src/config/env.validation.ts` | `GEO_AUTO_VERIFY_ENABLED`, `GEO_AUTO_VERIFY_MIN_CONFIDENCE` |
| `src/database/parsed-event.entity.ts` | `hiddenAt` kolona |
| `src/events/events.service.ts` | `hidden_at IS NULL` filter u map query-jima |

## Redosled implementacije

1. **Migracije** — `1710450000000`, `1710460000000`, `1710470000000`
2. **Entity fajlovi** — `admin-activity-log.entity.ts`, `location-alias.entity.ts`, proširiti `parsed-event.entity.ts`
3. **Activity Log servis** — `admin-activity-log.service.ts`
4. **Integrisati Activity Log u AdminService** — logovanje u sve metode
5. **Export `normalizeText`** iz geocoding servisa
6. **Geocoding Cache CRUD** — DTO, servis, controller
7. **Bulk Confirm Location** — DTO, endpoint, servis metoda
8. **Auto-Verify** — env varijable, `markAsVerified()`, enrichment integracija
9. **Location Aliases** — entity, DTO, servis, controller, pipeline integracija
10. **Soft Delete** — migracija, entity, restoreEvent, filter u map query-jima
11. **Admin Module update** — registracija svega
12. **Pokrenuti migracije** — `docker compose exec api npm run migration:run`
