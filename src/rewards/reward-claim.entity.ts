import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MobileUserEntity } from '../mobile-users/mobile-user.entity';
import { RewardTierEntity } from './reward-tier.entity';

export type RewardClaimStatus = 'pending' | 'approved' | 'paid' | 'rejected';

@Entity('reward_claims')
export class RewardClaimEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => MobileUserEntity)
  @JoinColumn({ name: 'user_id' })
  user!: MobileUserEntity;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => RewardTierEntity)
  @JoinColumn({ name: 'tier_id' })
  tier!: RewardTierEntity;

  @Column({ name: 'tier_id' })
  tierId!: string;

  @Column({ default: 'pending', length: 16 })
  status!: RewardClaimStatus;

  @CreateDateColumn({ name: 'claimed_at', type: 'timestamptz' })
  claimedAt!: Date;

  @Column({ name: 'fulfilled_at', nullable: true, type: 'timestamptz' })
  fulfilledAt?: Date;

  @Column({ name: 'payout_reference', nullable: true, length: 255 })
  payoutReference?: string;

  @Column({ nullable: true, type: 'text' })
  notes?: string;
}
