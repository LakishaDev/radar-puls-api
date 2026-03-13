import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AppLogger } from "../common/app.logger";
import { EnrichmentService } from "./enrichment.service";

async function bootstrapEnrichment(): Promise<void> {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const enrichmentService = appContext.get(EnrichmentService);
  const logger = appContext.get(AppLogger);

  await enrichmentService.startPolling();

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn("enrichment_shutdown", { signal });
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

void bootstrapEnrichment();