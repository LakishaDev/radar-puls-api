import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { StatsController } from "./stats.controller";

@Module({
  imports: [EventsModule],
  controllers: [StatsController],
})
export class StatsModule {}
