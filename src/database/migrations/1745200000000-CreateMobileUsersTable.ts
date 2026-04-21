import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMobileUsersTable1745200000000 implements MigrationInterface {
  name = 'CreateMobileUsersTable1745200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mobile_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_uuid VARCHAR(64) NOT NULL UNIQUE,
        fcm_token TEXT,
        platform VARCHAR(16),
        app_version VARCHAR(32),
        email VARCHAR(255) UNIQUE,
        email_verified_at TIMESTAMPTZ,
        points INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_mobile_users_device_uuid ON mobile_users (device_uuid)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_mobile_users_email ON mobile_users (email) WHERE email IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mobile_users`);
  }
}
