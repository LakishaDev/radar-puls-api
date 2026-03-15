import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGeocodingCacheAndExpandGeoSource1710420000000
  implements MigrationInterface
{
  name = "CreateGeocodingCacheAndExpandGeoSource1710420000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS geocoding_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        location_text TEXT NOT NULL,
        normalized_text TEXT NOT NULL UNIQUE,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        is_partial BOOLEAN NOT NULL DEFAULT false,
        location_type TEXT,
        formatted_addr TEXT,
        place_id TEXT,
        hit_count INT NOT NULL DEFAULT 1,
        verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_geocoding_cache_normalized ON geocoding_cache(normalized_text);",
    );

    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS idx_geocoding_cache_verified ON geocoding_cache(verified) WHERE verified = true;",
    );

    await queryRunner.query(`
      DO $$
      DECLARE constraint_name TEXT;
      BEGIN
        FOR constraint_name IN
          SELECT c.conname
          FROM pg_constraint c
          INNER JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'parsed_events'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%geo_source%'
        LOOP
          EXECUTE format('ALTER TABLE parsed_events DROP CONSTRAINT %I', constraint_name);
        END LOOP;
      END;
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE parsed_events
      ADD CONSTRAINT chk_parsed_events_geo_source
      CHECK (geo_source IN ('fallback', 'nominatim', 'cache', 'google', 'google_partial'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP CONSTRAINT IF EXISTS chk_parsed_events_geo_source;",
    );

    await queryRunner.query(`
      ALTER TABLE parsed_events
      ADD CONSTRAINT chk_parsed_events_geo_source
      CHECK (geo_source IN ('fallback', 'nominatim'));
    `);

    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_geocoding_cache_verified;",
    );

    await queryRunner.query(
      "DROP INDEX IF EXISTS idx_geocoding_cache_normalized;",
    );

    await queryRunner.query("DROP TABLE IF EXISTS geocoding_cache;");
  }
}
