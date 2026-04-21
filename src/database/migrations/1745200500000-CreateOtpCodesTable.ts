import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOtpCodesTable1745200500000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE otp_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        code_hash VARCHAR(128) NOT NULL,
        purpose VARCHAR(32) NOT NULL DEFAULT 'claim_identity',
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_otp_codes_lookup ON otp_codes (email, purpose, consumed_at)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS otp_codes`);
  }
}
