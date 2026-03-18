import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "mobile_push_tokens" })
@Index("idx_mobile_push_tokens_enabled", ["enabled"])
@Index("idx_mobile_push_tokens_device", ["deviceId"])
@Index("idx_mobile_push_tokens_zone", ["zoneLat", "zoneLng"])
export class MobilePushTokenEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", name: "fcm_token", unique: true })
  fcmToken!: string;

  @Column({ type: "varchar", length: 10, name: "platform" })
  platform!: "android" | "ios";

  @Column({ type: "text", name: "device_id" })
  deviceId!: string;

  @Column({ type: "double precision", name: "zone_lat", nullable: true })
  zoneLat!: number | null;

  @Column({ type: "double precision", name: "zone_lng", nullable: true })
  zoneLng!: number | null;

  @Column({ type: "int", name: "radius_meters", nullable: true })
  radiusMeters!: number | null;

  @Column({ type: "boolean", name: "enabled", default: true })
  enabled!: boolean;

  @Column({ type: "varchar", length: 20, name: "app_version", nullable: true })
  appVersion!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}