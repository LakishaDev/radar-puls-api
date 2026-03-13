import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMapPushSubscriptions1710410000000
  implements MigrationInterface
{
  name = "CreateMapPushSubscriptions1710410000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS map_push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        zone_lat DOUBLE PRECISION NULL,
        zone_lng DOUBLE PRECISION NULL,
        radius_meters INT NULL,
        client_ip_hash TEXT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_map_push_subscriptions_enabled ON map_push_subscriptions(enabled);",
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_map_push_subscriptions_zone ON map_push_subscriptions(zone_lat, zone_lng);",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_map_push_subscriptions_zone;",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_map_push_subscriptions_enabled;",
    );
    await queryRunner.query("DROP TABLE IF EXISTS map_push_subscriptions;");
  }
}
