import { RequestWithContext } from '../common/types';
import { CreateViberEventDto } from './dto/create-viber-event.dto';
import { EventsService } from './events.service';
export declare class EventsController {
    private readonly eventsService;
    constructor(eventsService: EventsService);
    createViberEvent(body: CreateViberEventDto, req: RequestWithContext, forceRateLimited?: string): Promise<{
        status: string;
        request_id: string;
    }>;
}
