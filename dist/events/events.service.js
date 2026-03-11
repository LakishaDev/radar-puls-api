"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const device_token_service_1 = require("../auth/device-token.service");
const app_logger_1 = require("../common/app.logger");
const raw_event_entity_1 = require("../database/raw-event.entity");
let EventsService = class EventsService {
    constructor(rawEventsRepository, deviceTokenService, logger) {
        this.rawEventsRepository = rawEventsRepository;
        this.deviceTokenService = deviceTokenService;
        this.logger = logger;
    }
    async ingestViberEvent(dto, authToken, requestId) {
        this.deviceTokenService.assertAuthorized(dto.device_id, authToken);
        try {
            const entity = this.rawEventsRepository.create({
                source: dto.source,
                groupName: dto.group,
                rawMessage: dto.message,
                eventTimestamp: new Date(dto.timestamp),
                receivedAt: new Date(),
                deviceId: dto.device_id,
                processingStatus: 'pending',
            });
            await this.rawEventsRepository.save(entity);
            this.logger.info('event_stored', {
                request_id: requestId,
                device_id: dto.device_id,
                source: dto.source,
            });
            return {
                status: 'accepted',
                request_id: requestId,
            };
        }
        catch (error) {
            this.logger.error('event_store_failed', {
                request_id: requestId,
                reason: error instanceof Error ? error.message : 'unknown',
            });
            throw new common_1.InternalServerErrorException();
        }
    }
};
exports.EventsService = EventsService;
exports.EventsService = EventsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(raw_event_entity_1.RawEventEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        device_token_service_1.DeviceTokenService,
        app_logger_1.AppLogger])
], EventsService);
//# sourceMappingURL=events.service.js.map