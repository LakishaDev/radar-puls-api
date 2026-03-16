import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateParsedEventsTable1710350000000
  implements MigrationInterface
{
  name = "CreateParsedEventsTable1710350000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      CREATE TABLE IF NOT EXISTS parsed_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        raw_event_id UUID NOT NULL UNIQUE REFERENCES raw_events(id) ON DELETE CASCADE,
        parse_status TEXT NOT NULL CHECK (parse_status IN ('parsed', 'no_match', 'partial')),
        event_type TEXT NOT NULL CHECK (event_type IN ('police', 'accident', 'traffic_jam', 'radar', 'control', 'unknown')),
        location_text TEXT,
        description TEXT,
        event_time TIMESTAMPTZ,
        confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
        parser_version TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      `,
    );

    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_parsed_events_parse_status ON parsed_events(parse_status);",
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_parsed_events_event_type ON parsed_events(event_type);",
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_parsed_events_created_at ON parsed_events(created_at);",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_parsed_events_created_at;",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_parsed_events_event_type;",
    );
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_parsed_events_parse_status;",
    );
    await queryRunner.query("DROP TABLE IF EXISTS parsed_events;");
  }
}
