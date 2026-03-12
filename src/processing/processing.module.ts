import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppLogger } from "../common/app.logger";
import { RawEventEntity } from "../database/raw-event.entity";
import { ParsingModule } from "../parsing/parsing.module";
import { ProcessingController } from "./processing.controller";
import { ProcessingDevGuard } from "./processing-dev.guard";
import { ProcessingService } from "./processing.service";
import { BackfillService } from "./backfill.service";
import { ProcessingBackfillGuard } from "./backfill.guard";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([RawEventEntity]),
    ParsingModule,
  ],
  controllers: [ProcessingController],
  providers: [
    ProcessingService,
    BackfillService,
    ProcessingDevGuard,
    ProcessingBackfillGuard,
    AppLogger,
  ],
  exports: [ProcessingService, BackfillService],
})
export class ProcessingModule {}
