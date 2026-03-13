import { MigrationInterface, QueryRunner } from "typeorm";

export class AddModerationFieldsToParsedEvents1710390000000
  implements MigrationInterface
{
  name = "AddModerationFieldsToParsedEvents1710390000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'auto_approved' CHECK (moderation_status IN ('auto_approved', 'pending_review', 'approved', 'rejected'));",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS moderated_by TEXT;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS moderation_note TEXT;",
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_parsed_events_moderation_status ON parsed_events(moderation_status);",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_parsed_events_moderation_status;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS moderation_note;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS moderated_at;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS moderated_by;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS moderation_status;",
    );
  }
}
