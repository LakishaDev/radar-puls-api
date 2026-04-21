import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type RewardType = 'in_app_benefit' | 'partner_promo_code' | 'cash_payout';

@Entity('reward_tiers')
export class RewardTierEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 64 })
  key!: string;

  @Column({ length: 128 })
  title!: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ length: 32 })
  type!: RewardType;

  @Column({ name: 'points_required' })
  pointsRequired!: number;

  @Column({ type: 'jsonb', default: '{}' })
  payload!: Record<string, unknown>;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
