import { MigrationInterface, QueryRunner } from "typeorm";

export class AddViberTripletAndEnrichmentCache1710490000000 implements MigrationInterface {
  name = "AddViberTripletAndEnrichmentCache1710490000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE raw_events
      ADD COLUMN IF NOT EXISTS sender_name TEXT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE raw_events
      ADD COLUMN IF NOT EXISTS message_time TEXT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE parsed_events
      ADD COLUMN IF NOT EXISTS parse_method TEXT NOT NULL DEFAULT 'rule';
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS enrichment_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        normalized_text TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        location_text TEXT NULL,
        confidence INT NOT NULL DEFAULT 0,
        hit_count INT NOT NULL DEFAULT 0,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        source TEXT NOT NULL DEFAULT 'ai',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_enrichment_cache_normalized ON enrichment_cache(normalized_text);",
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_enrichment_cache_verified ON enrichment_cache(verified) WHERE verified = true;",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_enrichment_cache_verified;",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_enrichment_cache_normalized;",
    );
    await queryRunner.query("DROP TABLE IF EXISTS enrichment_cache;");

    await queryRunner.query(`
      ALTER TABLE parsed_events
      DROP COLUMN IF EXISTS parse_method;
    `);

    await queryRunner.query(`
      ALTER TABLE raw_events
      DROP COLUMN IF EXISTS message_time;
    `);

    await queryRunner.query(`
      ALTER TABLE raw_events
      DROP COLUMN IF EXISTS sender_name;
    `);
  }
}
