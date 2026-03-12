import { Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { RequestWithContext } from "../common/types";
import { ProcessingDevGuard } from "./processing-dev.guard";
import { ProcessingService } from "./processing.service";

@Controller("/api/processing/dev")
export class ProcessingController {
  constructor(private readonly processingService: ProcessingService) {}

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
}
