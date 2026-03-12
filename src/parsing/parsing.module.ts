import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppLogger } from "../common/app.logger";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { ParsingService } from "./parsing.service";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([ParsedEventEntity])],
  providers: [ParsingService, AppLogger],
  exports: [ParsingService],
})
export class ParsingModule {}
