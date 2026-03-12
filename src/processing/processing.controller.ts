import { Controller, HttpCode, Post, Req, UseGuards, Query } from "@nestjs/common";
import { RequestWithContext } from "../common/types";
import { ProcessingDevGuard } from "./processing-dev.guard";
import { ProcessingService } from "./processing.service";
import { BackfillService } from "./backfill.service";
import { ProcessingBackfillGuard } from "./backfill.guard";

@Controller("/api/processing/dev")
export class ProcessingController {
  constructor(
    private readonly processingService: ProcessingService,
    private readonly backfillService: BackfillService,
  ) {}

  @Post("/run-once")
  @HttpCode(200)
  @UseGuards(ProcessingDevGuard)
  async runOneBatch(@Req() req: RequestWithContext): Promise<{
    status: string;
    request_id: string;
    claimed_count: number;
    processed_count: number;
    failed_count: number;
    duration_ms: number;
  }> {
    const result = await this.processingService.runSingleBatch("manual-trigger");

    return {
      status: "ok",
      request_id: req.requestId ?? "unknown",
      claimed_count: result.claimedCount,
      processed_count: result.processedCount,
      failed_count: result.failedCount,
      duration_ms: result.durationMs,
    };
  }

  @Post("/backfill")
  @HttpCode(200)
  @UseGuards(ProcessingBackfillGuard)
  async backfillProcessedEvents(
    @Req() req: RequestWithContext,
    @Query("limit") limit?: string,
    @Query("start") start?: string,
  ): Promise<{
    status: string;
    request_id: string;
    replayed: number;
    errors: number;
    duration_ms: number;
  }> {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const startDate = start ? new Date(start) : undefined;

    const result = await this.backfillService.backfillProcessedEvents({
      startDate,
      limit: limitNum,
    });

    return {
      status: "ok",
      request_id: req.requestId ?? "unknown",
      replayed: result.replayed,
      errors: result.errors,
      duration_ms: result.duration,
    };
  }
}
