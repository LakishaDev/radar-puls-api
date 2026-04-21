import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRewardClaimsTable1745200400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE reward_claims (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES mobile_users(id),
        tier_id UUID NOT NULL REFERENCES reward_tiers(id),
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        fulfilled_at TIMESTAMPTZ,
        payout_reference VARCHAR(255),
        notes TEXT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_reward_claims_user_tier ON reward_claims (user_id, tier_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reward_claims`);
  }
}
