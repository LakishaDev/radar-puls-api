import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ParsedEventEntity } from "./parsed-event.entity";

@Entity({ name: "admin_activity_log" })
export class AdminActivityLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "event_id", nullable: true })
  eventId!: string | null;

  @ManyToOne(() => ParsedEventEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "event_id" })
  event?: ParsedEventEntity;

  @Column({ type: "text", name: "target_type", default: "event" })
  targetType!: "event" | "cache" | "alias";

  @Column({ type: "text" })
  action!: string;

  @Column({ type: "text", name: "performed_by", default: "admin" })
  performedBy!: string;

  @Column({ type: "jsonb", name: "old_values", nullable: true })
  oldValues!: Record<string, unknown> | null;

  @Column({ type: "jsonb", name: "new_values", nullable: true })
  newValues!: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
