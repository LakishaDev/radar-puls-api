import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ParsedEventEntity } from "../database/parsed-event.entity";
import { RawEventEntity } from "../database/raw-event.entity";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [TypeOrmModule.forFeature([ParsedEventEntity, RawEventEntity]), AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
