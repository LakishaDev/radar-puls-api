import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGeoFieldsToParsedEvents1710370000000
  implements MigrationInterface
{
  name = "AddGeoFieldsToParsedEvents1710370000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS geo_source TEXT CHECK (geo_source IN ('fallback', 'nominatim'));",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS geo_source;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS longitude;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS latitude;",
    );
  }
}
