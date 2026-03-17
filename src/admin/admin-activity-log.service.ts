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
    eventId?: string | null;
    targetType?: "event" | "cache" | "alias";
    action: string;
    performedBy?: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    note?: string | null;
  }): Promise<void> {
    await this.logRepository.query(
      `
      INSERT INTO admin_activity_log (event_id, target_type, action, performed_by, old_values, new_values, note)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        params.eventId ?? null,
        params.targetType ?? "event",
        params.action,
        params.performedBy ?? "admin",
        params.oldValues ?? null,
        params.newValues ?? null,
        params.note ?? null,
      ],
    );
  }

  async getLogsForEvent(eventId: string): Promise<AdminActivityLogEntity[]> {
    return this.logRepository.query(
      `
      SELECT id, event_id, target_type, action, performed_by, old_values, new_values, note, created_at
      FROM admin_activity_log
      WHERE event_id = $1
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [eventId],
    ) as Promise<AdminActivityLogEntity[]>;
  }

  async getRecentLogs(limit = 50): Promise<Array<Record<string, unknown>>> {
    return this.logRepository.query(
      `
      SELECT
        al.id,
        al.event_id,
        al.target_type,
        al.action,
        al.performed_by,
        al.old_values,
        al.new_values,
        al.note,
        al.created_at,
        pe.event_type,
        pe.location_text
      FROM admin_activity_log al
      LEFT JOIN parsed_events pe ON pe.id = al.event_id
      ORDER BY al.created_at DESC
      LIMIT $1
      `,
      [limit],
    ) as Promise<Array<Record<string, unknown>>>;
  }
}
