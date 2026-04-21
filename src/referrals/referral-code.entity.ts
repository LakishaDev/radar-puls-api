import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MobileUserEntity } from '../mobile-users/mobile-user.entity';

@Entity('referral_codes')
export class ReferralCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => MobileUserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: MobileUserEntity;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ unique: true, length: 10 })
  code!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
