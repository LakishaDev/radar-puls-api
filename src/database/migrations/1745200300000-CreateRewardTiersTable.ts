import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRewardTiersTable1745200300000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE reward_tiers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(64) NOT NULL UNIQUE,
        title VARCHAR(128) NOT NULL,
        description TEXT,
        type VARCHAR(32) NOT NULL,
        points_required INT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}',
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO reward_tiers (key, title, description, type, points_required, payload) VALUES
      ('tier_badge_5', 'Radar ambasador', 'In-app bedž i prioritetni prikaz prijava', 'in_app_benefit', 5, '{"benefit_id": "ambassador_badge"}'),
      ('tier_promo_10', 'Partner promo kod', '10% popust kod partnera', 'partner_promo_code', 10, '{"partner_id": "partner_v1", "pool": []}'),
      ('tier_cash_25', 'Novčana nagrada', 'Isplata 500 RSD na PayPal ili bankovni račun', 'cash_payout', 25, '{"amount_rsd": 500}')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reward_tiers`);
  }
}
