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
