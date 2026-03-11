import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { AppLogger } from "../common/app.logger";
import { RawEventEntity } from "../database/raw-event.entity";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [TypeOrmModule.forFeature([RawEventEntity]), AuthModule],
  controllers: [EventsController],
  providers: [EventsService, AppLogger],
})
export class EventsModule {}
