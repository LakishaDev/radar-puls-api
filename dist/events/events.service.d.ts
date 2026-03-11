import { Repository } from 'typeorm';
import { DeviceTokenService } from '../auth/device-token.service';
import { AppLogger } from '../common/app.logger';
import { RawEventEntity } from '../database/raw-event.entity';
import { CreateViberEventDto } from './dto/create-viber-event.dto';
export declare class EventsService {
    private readonly rawEventsRepository;
    private readonly deviceTokenService;
    private readonly logger;
    constructor(rawEventsRepository: Repository<RawEventEntity>, deviceTokenService: DeviceTokenService, logger: AppLogger);
    ingestViberEvent(dto: CreateViberEventDto, authToken: string, requestId: string): Promise<{
        status: string;
        request_id: string;
    }>;
}
