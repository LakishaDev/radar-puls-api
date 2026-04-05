import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "raw_events" })
@Index("idx_raw_events_created_at", ["createdAt"])
@Index("idx_raw_events_processing_status", ["processingStatus"])
@Index("idx_raw_events_device_id", ["deviceId"])
@Index("idx_raw_events_status_next_retry_created", [
  "processingStatus",
  "nextRetryAt",
  "createdAt",
])
export class RawEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  source!: string;

  @Column({ type: "text", name: "group_name" })
  groupName!: string;

  @Column({ type: "text", name: "raw_message" })
  rawMessage!: string;

  @Column({ type: "text", name: "sender_name", nullable: true })
  senderName!: string | null;

  @Column({ type: "text", name: "message_time", nullable: true })
  messageTime!: string | null;

  @Column({ type: "timestamptz", name: "event_timestamp" })
  eventTimestamp!: Date;

  @Column({ type: "timestamptz", name: "received_at" })
  receivedAt!: Date;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @Column({ type: "text", name: "device_id" })
  deviceId!: string;

  @Column({ type: "text", name: "processing_status", default: "pending" })
  processingStatus!: string;

  @Column({ type: "integer", name: "retry_count", default: 0 })
  retryCount!: number;

  @Column({ type: "timestamptz", name: "next_retry_at", nullable: true })
  nextRetryAt!: Date | null;

  @Column({
    type: "timestamptz",
    name: "processing_started_at",
    nullable: true,
  })
  processingStartedAt!: Date | null;

  @Column({ type: "timestamptz", name: "processed_at", nullable: true })
  processedAt!: Date | null;

  @Column({ type: "timestamptz", name: "failed_at", nullable: true })
  failedAt!: Date | null;

  @Column({ type: "text", name: "last_error", nullable: true })
  lastError!: string | null;

  @Column({ type: "text", name: "processor_instance", nullable: true })
  processorInstance!: string | null;
}
