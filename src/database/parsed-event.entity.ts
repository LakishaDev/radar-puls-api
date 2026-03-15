import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { RawEventEntity } from "./raw-event.entity";

@Entity({ name: "parsed_events" })
@Index("idx_parsed_events_parse_status", ["parseStatus"])
@Index("idx_parsed_events_event_type", ["eventType"])
@Index("idx_parsed_events_created_at", ["createdAt"])
@Index("idx_parsed_events_enrich_status_created_at", ["enrichStatus", "createdAt"])
@Index("idx_parsed_events_moderation_status", ["moderationStatus"])
@Index("idx_parsed_events_expires_at", ["expiresAt"])
export class ParsedEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "raw_event_id", unique: true })
  rawEventId!: string;

  @ManyToOne(() => RawEventEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "raw_event_id" })
  rawEvent?: RawEventEntity;

  @Column({ type: "text", name: "parse_status" })
  parseStatus!: string;

  @Column({ type: "text", name: "event_type" })
  eventType!: string;

  @Column({ type: "text", name: "location_text", nullable: true })
  locationText!: string | null;

  @Column({ type: "text", name: "sender_name", nullable: true })
  senderName!: string | null;

  @Column({ type: "text", name: "description", nullable: true })
  description!: string | null;

  @Column({ type: "timestamptz", name: "event_time", nullable: true })
  eventTime!: Date | null;

  @Column({ type: "numeric", name: "confidence", precision: 3, scale: 2 })
  confidence!: number;

  @Column({ type: "text", name: "enrich_status", nullable: true })
  enrichStatus!: string | null;

  @Column({ type: "timestamptz", name: "enriched_at", nullable: true })
  enrichedAt!: Date | null;

  @Column({ type: "int", name: "enrich_attempts", default: 0 })
  enrichAttempts!: number;

  @Column({ type: "timestamptz", name: "enrich_next_retry_at", nullable: true })
  enrichNextRetryAt!: Date | null;

  @Column({ type: "double precision", name: "latitude", nullable: true })
  latitude!: number | null;

  @Column({ type: "double precision", name: "longitude", nullable: true })
  longitude!: number | null;

  @Column({ type: "text", name: "geo_source", nullable: true })
  geoSource!:
    | "fallback"
    | "nominatim"
    | "cache"
    | "google"
    | "google_partial"
    | null;

  @Column({
    type: "timestamptz",
    name: "expires_at",
    default: () => "NOW() + INTERVAL '2 hours'",
  })
  expiresAt!: Date;

  @Column({ type: "int", name: "upvotes", default: 0 })
  upvotes!: number;

  @Column({ type: "int", name: "downvotes", default: 0 })
  downvotes!: number;

  @Column({
    type: "text",
    name: "moderation_status",
    default: "auto_approved",
  })
  moderationStatus!:
    | "auto_approved"
    | "pending_review"
    | "approved"
    | "rejected";

  @Column({ type: "text", name: "moderated_by", nullable: true })
  moderatedBy!: string | null;

  @Column({ type: "timestamptz", name: "moderated_at", nullable: true })
  moderatedAt!: Date | null;

  @Column({ type: "text", name: "moderation_note", nullable: true })
  moderationNote!: string | null;

  @Column({ type: "text", name: "parser_version" })
  parserVersion!: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
