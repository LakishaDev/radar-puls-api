import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppLogger } from "../common/app.logger";
import { RawEventEntity } from "../database/raw-event.entity";
import { ProcessingController } from "./processing.controller";
import { ProcessingDevGuard } from "./processing-dev.guard";
import { ProcessingService } from "./processing.service";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([RawEventEntity])],
  controllers: [ProcessingController],
  providers: [ProcessingService, ProcessingDevGuard, AppLogger],
  exports: [ProcessingService],
})
export class ProcessingModule {}
