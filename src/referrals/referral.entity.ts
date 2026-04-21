import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MobileUserEntity } from '../mobile-users/mobile-user.entity';

export type ReferralStatus = 'pending' | 'qualified' | 'rejected_fraud';

@Entity('referrals')
export class ReferralEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => MobileUserEntity)
  @JoinColumn({ name: 'referrer_user_id' })
  referrer!: MobileUserEntity;

  @Column({ name: 'referrer_user_id' })
  referrerUserId!: string;

  @ManyToOne(() => MobileUserEntity)
  @JoinColumn({ name: 'invitee_user_id' })
  invitee!: MobileUserEntity;

  @Column({ name: 'invitee_user_id', unique: true })
  inviteeUserId!: string;

  @Column({ default: 'pending', length: 16 })
  status!: ReferralStatus;

  @CreateDateColumn({ name: 'attached_at', type: 'timestamptz' })
  attachedAt!: Date;

  @Column({ name: 'qualified_at', nullable: true, type: 'timestamptz' })
  qualifiedAt?: Date;

  @Column({ name: 'rejection_reason', nullable: true, type: 'text' })
  rejectionReason?: string;

  @Column({ name: 'invitee_ip', nullable: true, type: 'inet' })
  inviteeIp?: string;

  @Column({ name: 'invitee_device_uuid', nullable: true, length: 64 })
  inviteeDeviceUuid?: string;
}
