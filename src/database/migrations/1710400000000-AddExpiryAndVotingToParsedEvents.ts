import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExpiryAndVotingToParsedEvents1710400000000
  implements MigrationInterface
{
  name = "AddExpiryAndVotingToParsedEvents1710400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 hours';",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS upvotes INT NOT NULL DEFAULT 0;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS downvotes INT NOT NULL DEFAULT 0;",
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_parsed_events_expires_at ON parsed_events(expires_at);",
    );

    await queryRunner.query(
      `
      CREATE TABLE IF NOT EXISTS map_report_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parsed_event_id UUID NOT NULL REFERENCES parsed_events(id) ON DELETE CASCADE,
        voter_hash TEXT NOT NULL,
        vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(parsed_event_id, voter_hash)
      );
      `,
    );
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_map_report_votes_event_id ON map_report_votes(parsed_event_id);",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_map_report_votes_event_id;",
    );
    await queryRunner.query("DROP TABLE IF EXISTS map_report_votes;");
    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_parsed_events_expires_at;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS downvotes;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS upvotes;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS expires_at;",
    );
  }
}
