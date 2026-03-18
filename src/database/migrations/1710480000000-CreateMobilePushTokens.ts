import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMobilePushTokens1710480000000 implements MigrationInterface {
  name = "CreateMobilePushTokens1710480000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mobile_push_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fcm_token TEXT NOT NULL UNIQUE,
        platform VARCHAR(10) NOT NULL CHECK (platform IN ('android', 'ios')),
        device_id TEXT NOT NULL,
        zone_lat DOUBLE PRECISION NULL,
        zone_lng DOUBLE PRECISION NULL,
        radius_meters INT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        app_version VARCHAR(20) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_enabled ON mobile_push_tokens(enabled);",
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_device ON mobile_push_tokens(device_id);",
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_zone ON mobile_push_tokens(zone_lat, zone_lng);",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IF EXISTS idx_mobile_push_tokens_zone;");
    await queryRunner.query("DROP INDEX IF EXISTS idx_mobile_push_tokens_device;");
    await queryRunner.query("DROP INDEX IF EXISTS idx_mobile_push_tokens_enabled;");
    await queryRunner.query("DROP TABLE IF EXISTS mobile_push_tokens;");
  }
}