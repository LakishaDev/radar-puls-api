import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdminGeoSource1710440000000 implements MigrationInterface {
  name = "AddAdminGeoSource1710440000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP CONSTRAINT IF EXISTS chk_parsed_events_geo_source;",
    );

    await queryRunner.query(`
      ALTER TABLE parsed_events
      ADD CONSTRAINT chk_parsed_events_geo_source
      CHECK (geo_source IN (
        'fallback', 'nominatim', 'cache', 'google', 'google_partial',
        'admin', 'admin_confirmed'
      ));
    `);

    await queryRunner.query(`
      ALTER TABLE parsed_events
      ADD COLUMN IF NOT EXISTS edit_source TEXT DEFAULT 'ai_raw'
      CHECK (edit_source IN ('ai_raw', 'admin_edited', 'admin_confirmed', 'web_submitted'));
    `);

    await queryRunner.query(
      "UPDATE parsed_events SET edit_source = 'ai_raw' WHERE edit_source IS NULL;",
    );

    await queryRunner.query(`
      UPDATE parsed_events
      SET edit_source = 'admin_edited'
      WHERE moderated_at IS NOT NULL AND edit_source = 'ai_raw';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP CONSTRAINT IF EXISTS chk_parsed_events_geo_source;",
    );

    await queryRunner.query(`
      ALTER TABLE parsed_events
      ADD CONSTRAINT chk_parsed_events_geo_source
      CHECK (geo_source IN ('fallback', 'nominatim', 'cache', 'google', 'google_partial'));
    `);

    await queryRunner.query("ALTER TABLE parsed_events DROP COLUMN IF EXISTS edit_source;");
  }
}
