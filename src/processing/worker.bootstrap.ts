import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AppLogger } from "../common/app.logger";
import { ProcessingService } from "./processing.service";

async function bootstrapWorker(): Promise<void> {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const processingService = appContext.get(ProcessingService);
  const logger = appContext.get(AppLogger);

  await processingService.startPolling();

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn("worker_shutdown", { signal });
    await appContext.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void bootstrapWorker();
