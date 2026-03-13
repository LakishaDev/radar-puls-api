import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRetryFieldsToParsedEvents1710380000000
  implements MigrationInterface
{
  name = "AddRetryFieldsToParsedEvents1710380000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS enrich_attempts INT NOT NULL DEFAULT 0;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS enrich_next_retry_at TIMESTAMPTZ NULL;",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS enrich_next_retry_at;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS enrich_attempts;",
    );
  }
}