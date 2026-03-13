import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "map_push_subscriptions" })
@Index("idx_map_push_subscriptions_enabled", ["enabled"])
@Index("idx_map_push_subscriptions_zone", ["zoneLat", "zoneLng"])
export class MapPushSubscriptionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", unique: true })
  endpoint!: string;

  @Column({ type: "text", name: "p256dh" })
  p256dh!: string;

  @Column({ type: "text", name: "auth" })
  auth!: string;

  @Column({ type: "double precision", name: "zone_lat", nullable: true })
  zoneLat!: number | null;

  @Column({ type: "double precision", name: "zone_lng", nullable: true })
  zoneLng!: number | null;

  @Column({ type: "int", name: "radius_meters", nullable: true })
  radiusMeters!: number | null;

  @Column({ type: "text", name: "client_ip_hash", nullable: true })
  clientIpHash!: string | null;

  @Column({ type: "boolean", name: "enabled", default: true })
  enabled!: boolean;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
