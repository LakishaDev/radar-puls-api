import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSoftDeleteToParsedEvents1710470000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE parsed_events
        ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ DEFAULT NULL;

      UPDATE parsed_events
        SET hidden_at = moderated_at
        WHERE moderation_status = 'rejected' AND hidden_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_parsed_events_hidden_at ON parsed_events (hidden_at)
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
