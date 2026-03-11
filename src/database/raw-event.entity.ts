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
export class RawEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  source!: string;

  @Column({ type: "text", name: "group_name" })
  groupName!: string;

  @Column({ type: "text", name: "raw_message" })
  rawMessage!: string;

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
}
