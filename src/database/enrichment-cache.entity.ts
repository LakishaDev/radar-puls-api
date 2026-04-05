import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { EventType } from "../parsing/types";

@Entity({ name: "enrichment_cache" })
@Index("idx_enrichment_cache_normalized", ["normalizedText"], { unique: true })
@Index("idx_enrichment_cache_verified", ["verified"], {
  where: "verified = true",
})
export class EnrichmentCacheEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", name: "normalized_text" })
  normalizedText!: string;

  @Column({ type: "text", name: "event_type" })
  eventType!: EventType;

  @Column({ type: "text", name: "location_text", nullable: true })
  locationText!: string | null;

  @Column({ type: "integer", name: "confidence", default: 0 })
  confidence!: number;

  @Column({ type: "integer", name: "hit_count", default: 0 })
  hitCount!: number;

  @Column({ type: "boolean", default: false })
  verified!: boolean;

  @Column({ type: "text", name: "source", default: "ai" })
  source!: "ai" | "keyword" | "admin";

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
