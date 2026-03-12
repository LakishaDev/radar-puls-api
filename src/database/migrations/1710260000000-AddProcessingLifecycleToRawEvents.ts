import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProcessingLifecycleToRawEvents1710260000000
  implements MigrationInterface
{
  name = "AddProcessingLifecycleToRawEvents1710260000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NULL;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS processing_started_at timestamptz NULL;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS processed_at timestamptz NULL;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS failed_at timestamptz NULL;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS last_error text NULL;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events ADD COLUMN IF NOT EXISTS processor_instance text NULL;",
    );

    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_raw_events_status_next_retry_created ON raw_events (processing_status, next_retry_at, created_at);",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_raw_events_status_next_retry_created;",
    );

    await queryRunner.query(
      "ALTER TABLE raw_events DROP COLUMN IF EXISTS processor_instance;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events DROP COLUMN IF EXISTS last_error;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events DROP COLUMN IF EXISTS failed_at;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events DROP COLUMN IF EXISTS processed_at;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events DROP COLUMN IF EXISTS processing_started_at;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events DROP COLUMN IF EXISTS next_retry_at;",
    );
    await queryRunner.query(
      "ALTER TABLE raw_events DROP COLUMN IF EXISTS retry_count;",
    );
  }
}
