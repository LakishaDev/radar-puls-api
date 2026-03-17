import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "location_aliases" })
export class LocationAliasEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", name: "alias_text" })
  aliasText!: string;

  @Column({ type: "text", name: "normalized_alias", unique: true })
  normalizedAlias!: string;

  @Column({ type: "text", name: "target_location_text" })
  targetLocationText!: string;

  @Column({ type: "double precision", name: "target_lat" })
  targetLat!: number;

  @Column({ type: "double precision", name: "target_lng" })
  targetLng!: number;

  @Column({ type: "text", name: "created_by", default: "admin" })
  createdBy!: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
