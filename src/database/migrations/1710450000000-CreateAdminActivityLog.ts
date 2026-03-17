import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAdminActivityLog1710450000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE admin_activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID REFERENCES parsed_events(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL DEFAULT 'event' CHECK (target_type IN ('event', 'cache', 'alias')),
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
      CREATE INDEX idx_admin_activity_log_target_type ON admin_activity_log (target_type);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS admin_activity_log;`);
  }
}
