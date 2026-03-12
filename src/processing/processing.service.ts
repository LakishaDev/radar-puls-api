import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { hostname } from "node:os";
import { Repository } from "typeorm";
import { AppLogger } from "../common/app.logger";
import { RawEventEntity } from "../database/raw-event.entity";

type BatchSource = "poller" | "manual-trigger";

type BatchResult = {
  claimedCount: number;
  processedCount: number;
  failedCount: number;
  durationMs: number;
};

type ClaimedEvent = {
  id: string;
  rawMessage: string;
};

const RETRY_BACKOFF_MS: Record<number, number> = {
  1: 30_000,
  2: 2 * 60_000,
  3: 10 * 60_000,
};

@Injectable()
export class ProcessingService implements OnModuleDestroy {
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly leaseTimeoutMs: number;
  private readonly instanceId: string;
  private readonly maxRetries: number;

  private pollTimer: NodeJS.Timeout | null = null;
  private cycleInProgress = false;

  constructor(
    @InjectRepository(RawEventEntity)
    private readonly rawEventsRepository: Repository<RawEventEntity>,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.batchSize = this.getPositiveInt("WORKER_BATCH_SIZE", 100);
    this.pollIntervalMs = this.getPositiveInt("WORKER_POLL_INTERVAL_MS", 5000);
    this.leaseTimeoutMs = this.getPositiveInt("WORKER_LEASE_TIMEOUT_MS", 5 * 60_000);
    this.maxRetries = this.getPositiveInt("WORKER_MAX_RETRIES", 3);
    this.instanceId =
      this.configService.get<string>("WORKER_INSTANCE_ID") ??
      `${hostname()}-${process.pid}`;
  }

  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async startPolling(): Promise<void> {
    this.logger.info("worker_started", {
      worker_instance: this.instanceId,
      batch_size: this.batchSize,
      poll_interval_ms: this.pollIntervalMs,
      lease_timeout_ms: this.leaseTimeoutMs,
    });

    await this.runSingleBatch("poller");

    this.pollTimer = setInterval(() => {
      void this.runSingleBatch("poller");
    }, this.pollIntervalMs);
  }

  async runSingleBatch(source: BatchSource): Promise<BatchResult> {
    if (this.cycleInProgress) {
      this.logger.warn("batch_skipped_overlap", {
        worker_instance: this.instanceId,
        source,
      });
      return {
        claimedCount: 0,
        processedCount: 0,
        failedCount: 0,
        durationMs: 0,
      };
    }

    this.cycleInProgress = true;
    const startedAt = Date.now();

    try {
      this.logger.info("claim_started", {
        worker_instance: this.instanceId,
        source,
      });

      const claimed = await this.claimBatch();

      this.logger.info("claim_completed", {
        worker_instance: this.instanceId,
        source,
        claimed_count: claimed.length,
      });

      let processedCount = 0;
      let failedCount = 0;

      for (const event of claimed) {
        try {
          await this.processEvent(event);
          processedCount += 1;
          this.logger.info("process_success", {
            worker_instance: this.instanceId,
            raw_event_id: event.id,
          });
        } catch (error) {
          failedCount += 1;
          const message =
            error instanceof Error ? error.message : "unknown processing error";
          const retryDecision = await this.markRetryOrFailed(event.id, message);

          this.logger.warn(retryDecision.logEvent, {
            worker_instance: this.instanceId,
            raw_event_id: event.id,
            retry_count: retryDecision.retryCount,
            next_retry_at: retryDecision.nextRetryAt,
            reason: message,
          });
        }
      }

      const durationMs = Date.now() - startedAt;
      this.logger.info("batch_completed", {
        worker_instance: this.instanceId,
        source,
        claimed_count: claimed.length,
        processed_count: processedCount,
        failed_count: failedCount,
        duration_ms: durationMs,
      });

      return {
        claimedCount: claimed.length,
        processedCount,
        failedCount,
        durationMs,
      };
    } finally {
      this.cycleInProgress = false;
    }
  }

  private async claimBatch(): Promise<ClaimedEvent[]> {
    // TypeORM returns [rows, rowCount] for UPDATE commands
    const [rows] = (await this.rawEventsRepository.query(
      `
      WITH candidates AS (
        SELECT id
        FROM raw_events
        WHERE (
          processing_status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        )
        OR (
          processing_status = 'processing'
          AND processing_started_at <= NOW() - ($2::bigint * INTERVAL '1 millisecond')
        )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE raw_events re
      SET
        processing_status = 'processing',
        processing_started_at = NOW(),
        processor_instance = $3,
        last_error = NULL
      FROM candidates
      WHERE re.id = candidates.id
      RETURNING re.id, re.raw_message;
      `,
      [this.batchSize, this.leaseTimeoutMs, this.instanceId],
    )) as [Array<{ id?: string; raw_message?: string }>, number];

    return (rows ?? [])
      .filter((row) => typeof row.id === "string" && row.id.length > 0)
      .map((row) => ({
        id: row.id as string,
        rawMessage: row.raw_message ?? "",
      }));
  }

  private async processEvent(event: ClaimedEvent): Promise<void> {
    if (event.rawMessage.startsWith("[fail-processing]")) {
      throw new Error("forced processing failure");
    }

    // TypeORM returns [rows, rowCount] for UPDATE commands
    const [rows] = (await this.rawEventsRepository.query(
      `
      UPDATE raw_events
      SET
        processing_status = 'processed',
        processed_at = NOW(),
        processing_started_at = NULL,
        next_retry_at = NULL,
        failed_at = NULL,
        last_error = NULL
      WHERE
        id = $1
        AND processing_status = 'processing'
        AND processor_instance = $2
      RETURNING id;
      `,
      [event.id, this.instanceId],
    )) as [Array<{ id: string }>, number];

    if ((rows ?? []).length !== 1) {
      throw new Error("processing state transition guard failed");
    }
  }

  private async markRetryOrFailed(
    eventId: string,
    errorMessage: string,
  ): Promise<{ logEvent: "process_retry" | "process_failed"; retryCount: number; nextRetryAt: Date | null }> {
    const row = (await this.rawEventsRepository.query(
      `
      SELECT retry_count
      FROM raw_events
      WHERE
        id = $1
        AND processing_status = 'processing'
        AND processor_instance = $2
      LIMIT 1;
      `,
      [eventId, this.instanceId],
    )) as Array<{ retry_count: number }>;

    if (row.length !== 1) {
      return {
        logEvent: "process_failed",
        retryCount: 0,
        nextRetryAt: null,
      };
    }

    const currentRetryCount = row[0].retry_count;
    const nextRetryCount = currentRetryCount + 1;
    const shouldRetry = nextRetryCount <= this.maxRetries;

    if (!shouldRetry) {
      await this.rawEventsRepository.query(
        `
        UPDATE raw_events
        SET
          processing_status = 'failed',
          failed_at = NOW(),
          processing_started_at = NULL,
          next_retry_at = NULL,
          last_error = $3
        WHERE
          id = $1
          AND processing_status = 'processing'
          AND processor_instance = $2;
        `,
        [eventId, this.instanceId, errorMessage],
      );

      return {
        logEvent: "process_failed",
        retryCount: currentRetryCount,
        nextRetryAt: null,
      };
    }

    const backoffMs = RETRY_BACKOFF_MS[nextRetryCount] ?? RETRY_BACKOFF_MS[3];
    const nextRetryAt = new Date(Date.now() + backoffMs);

    await this.rawEventsRepository.query(
      `
      UPDATE raw_events
      SET
        processing_status = 'pending',
        retry_count = $3,
        next_retry_at = $4,
        failed_at = NULL,
        processing_started_at = NULL,
        last_error = $5
      WHERE
        id = $1
        AND processing_status = 'processing'
        AND processor_instance = $2;
      `,
      [eventId, this.instanceId, nextRetryCount, nextRetryAt, errorMessage],
    );

    return {
      logEvent: "process_retry",
      retryCount: nextRetryCount,
      nextRetryAt,
    };
  }

  private getPositiveInt(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    if (!raw) {
      return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }
}
