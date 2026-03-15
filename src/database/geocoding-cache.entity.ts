import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "geocoding_cache" })
@Index("idx_geocoding_cache_normalized", ["normalizedText"])
@Index("idx_geocoding_cache_verified", ["verified"], { where: "verified = true" })
export class GeocodingCacheEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", name: "location_text" })
  locationText!: string;

  @Column({ type: "text", name: "normalized_text", unique: true })
  normalizedText!: string;

  @Column({ type: "double precision" })
  lat!: number;

  @Column({ type: "double precision" })
  lng!: number;

  @Column({ type: "boolean", name: "is_partial", default: false })
  isPartial!: boolean;

  @Column({ type: "text", name: "location_type", nullable: true })
  locationType!: string | null;

  @Column({ type: "text", name: "formatted_addr", nullable: true })
  formattedAddr!: string | null;

  @Column({ type: "text", name: "place_id", nullable: true })
  placeId!: string | null;

  @Column({ type: "int", name: "hit_count", default: 1 })
  hitCount!: number;

  @Column({ type: "boolean", default: false })
  verified!: boolean;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
