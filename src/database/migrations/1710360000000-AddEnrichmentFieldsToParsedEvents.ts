import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEnrichmentFieldsToParsedEvents1710360000000
  implements MigrationInterface
{
  name = "AddEnrichmentFieldsToParsedEvents1710360000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS sender_name TEXT;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS enrich_status TEXT CHECK (enrich_status IN ('pending', 'enriched', 'failed'));",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;",
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_parsed_events_enrich_status_created_at ON parsed_events(enrich_status, created_at);",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_parsed_events_enrich_status_created_at;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS enriched_at;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS enrich_status;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS sender_name;",
    );
  }
}