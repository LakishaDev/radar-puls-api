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
exports.EventsController = void 0;
const common_1 = require("@nestjs/common");
const device_auth_guard_1 = require("../auth/device-auth.guard");
const create_viber_event_dto_1 = require("./dto/create-viber-event.dto");
const events_service_1 = require("./events.service");
let EventsController = class EventsController {
    constructor(eventsService) {
        this.eventsService = eventsService;
    }
    async createViberEvent(body, req, forceRateLimited) {
        if (forceRateLimited === '1') {
            throw new common_1.HttpException('Rate limited', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        return this.eventsService.ingestViberEvent(body, req.authToken ?? '', req.requestId ?? 'unknown');
    }
};
exports.EventsController = EventsController;
__decorate([
    (0, common_1.Post)('/viber'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(device_auth_guard_1.DeviceAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Headers)('x-radar-force-429')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_viber_event_dto_1.CreateViberEventDto, Object, String]),
    __metadata("design:returntype", Promise)
], EventsController.prototype, "createViberEvent", null);
exports.EventsController = EventsController = __decorate([
    (0, common_1.Controller)('/api/events'),
    __metadata("design:paramtypes", [events_service_1.EventsService])
], EventsController);
//# sourceMappingURL=events.controller.js.map