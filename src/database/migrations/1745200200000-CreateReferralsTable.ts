import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReferralsTable1745200200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE referrals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_user_id UUID NOT NULL REFERENCES mobile_users(id),
        invitee_user_id UUID NOT NULL UNIQUE REFERENCES mobile_users(id),
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        qualified_at TIMESTAMPTZ,
        rejection_reason TEXT,
        invitee_ip INET,
        invitee_device_uuid VARCHAR(64)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_referrals_referrer ON referrals (referrer_user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_referrals_status_attached ON referrals (status, attached_at)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS referrals`);
  }
}
