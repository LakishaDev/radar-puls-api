import { MigrationInterface, QueryRunner } from "typeorm";

export class ExpandConfidenceRangeTo1001710430000000
  implements MigrationInterface
{
  name = "ExpandConfidenceRangeTo1001710430000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE constraint_name TEXT;
      BEGIN
        SELECT conname
        INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'parsed_events'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%confidence%'
          AND contype = 'c'
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE parsed_events DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
    `);

    await queryRunner.query(
      "ALTER TABLE parsed_events ALTER COLUMN confidence TYPE NUMERIC(5,2);",
    );

    await queryRunner.query(
      "UPDATE parsed_events SET confidence = ROUND(confidence * 100, 2) WHERE confidence <= 1;",
    );

    await queryRunner.query(
      "ALTER TABLE parsed_events ADD CONSTRAINT chk_parsed_events_confidence_range CHECK (confidence >= 0 AND confidence <= 100);",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP CONSTRAINT IF EXISTS chk_parsed_events_confidence_range;",
    );

    await queryRunner.query(
      "UPDATE parsed_events SET confidence = ROUND(confidence / 100, 2) WHERE confidence > 1;",
    );

    await queryRunner.query(
      "ALTER TABLE parsed_events ALTER COLUMN confidence TYPE NUMERIC(3,2);",
    );

    await queryRunner.query(
      "ALTER TABLE parsed_events ADD CONSTRAINT chk_parsed_events_confidence_range CHECK (confidence >= 0 AND confidence <= 1);",
    );
  }
}
