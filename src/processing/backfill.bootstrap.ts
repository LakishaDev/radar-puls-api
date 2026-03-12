import { NestFactory } from "@nestjs/core";
import { ProcessingModule } from "./processing.module";
import { BackfillService } from "./backfill.service";
import { AppLogger } from "../common/app.logger";

/**
 * Backfill CLI bootstrap — pokreće batch reparsiranje već obrađenih zapisa
 * Primena: npm run backfill -- --mode processed --limit 100
 */
async function bootstrap() {
  const app = await NestFactory.create(ProcessingModule);
  const logger = app.get(AppLogger);
  const backfillService = app.get(BackfillService);

  logger.info("backfill_bootstrap_started", {
    pid: process.pid,
    args: process.argv.slice(2),
  });

  try {
    const mode = process.argv.find((arg) => arg.includes("--mode"))?.split("=")[1] ?? "processed";
    const limitStr = process.argv.find((arg) => arg.includes("--limit"))?.split("=")[1] ?? "50";
    const limit = parseInt(limitStr, 10) || 50;

    const startDateStr = process.argv.find((arg) => arg.includes("--start"))?.split("=")[1];
    const startDate = startDateStr ? new Date(startDateStr) : undefined;

    let result;

    if (mode === "find-missing") {
      // Samo pronađi koliko processed zapisa nema parsed entries
      result = await backfillService.findProcessedWithoutParsed(limit);
      logger.info("backfill_find_missing_result", result);
    } else if (mode === "processed") {
      // Reparsiranje processed zapisa (default mode)
      result = await backfillService.backfillProcessedEvents({
        startDate,
        limit,
      });
      logger.info("backfill_result", result);
    } else {
      logger.error("backfill_unknown_mode", { mode });
      process.exit(1);
    }
  } catch (error) {
    logger.error("backfill_bootstrap_error", {
      error: error instanceof Error ? error.message : "unknown",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
