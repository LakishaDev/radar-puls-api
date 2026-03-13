import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AppLogger } from "../common/app.logger";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { RawEventEntity } from "../database/raw-event.entity";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [TypeOrmModule.forFeature([RawEventEntity, ParsedEventEntity]), AuthModule],
  controllers: [EventsController],
  providers: [EventsService, AppLogger],
  exports: [EventsService],
})
export class EventsModule {}
