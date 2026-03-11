import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DeviceTokenService } from "../auth/device-token.service";
import { AppLogger } from "../common/app.logger";
import { RawEventEntity } from "../database/raw-event.entity";
import { CreateViberEventDto } from "./dto/create-viber-event.dto";

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(RawEventEntity)
    private readonly rawEventsRepository: Repository<RawEventEntity>,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly logger: AppLogger,
  ) {}

  async ingestViberEvent(
    dto: CreateViberEventDto,
    authToken: string,
    requestId: string,
  ): Promise<{ status: string; request_id: string }> {
    this.deviceTokenService.assertAuthorized(dto.device_id, authToken);

    try {
      const entity = this.rawEventsRepository.create({
        source: dto.source,
        groupName: dto.group,
        rawMessage: dto.message,
        eventTimestamp: new Date(dto.timestamp),
        receivedAt: new Date(),
        deviceId: dto.device_id,
        processingStatus: "pending",
      });

      await this.rawEventsRepository.save(entity);

      this.logger.info("event_stored", {
        request_id: requestId,
        device_id: dto.device_id,
        source: dto.source,
      });

      return {
        status: "accepted",
        request_id: requestId,
      };
    } catch (error) {
      this.logger.error("event_store_failed", {
        request_id: requestId,
        reason: error instanceof Error ? error.message : "unknown",
      });
      throw new InternalServerErrorException();
    }
  }
}
