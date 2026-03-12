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

  @Column({ type: "text", name: "description", nullable: true })
  description!: string | null;

  @Column({ type: "timestamptz", name: "event_time", nullable: true })
  eventTime!: Date | null;

  @Column({ type: "numeric", name: "confidence", precision: 3, scale: 2 })
  confidence!: number;

  @Column({ type: "text", name: "parser_version" })
  parserVersion!: string;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
