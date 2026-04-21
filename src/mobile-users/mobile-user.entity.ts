import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('mobile_users')
export class MobileUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'device_uuid', unique: true, length: 64 })
  deviceUuid!: string;

  @Column({ name: 'fcm_token', nullable: true, type: 'text' })
  fcmToken?: string;

  @Column({ nullable: true, length: 16 })
  platform?: string;

  @Column({ name: 'app_version', nullable: true, length: 32 })
  appVersion?: string;

  @Column({ nullable: true, unique: true, length: 255 })
  email?: string;

  @Column({ name: 'email_verified_at', nullable: true, type: 'timestamptz' })
  emailVerifiedAt?: Date;

  @Column({ default: 0 })
  points!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'last_seen_at', nullable: true, type: 'timestamptz' })
  lastSeenAt?: Date;
}
