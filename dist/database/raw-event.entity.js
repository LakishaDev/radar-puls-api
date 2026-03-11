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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RawEventEntity = void 0;
const typeorm_1 = require("typeorm");
let RawEventEntity = class RawEventEntity {
};
exports.RawEventEntity = RawEventEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], RawEventEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], RawEventEntity.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', name: 'group_name' }),
    __metadata("design:type", String)
], RawEventEntity.prototype, "groupName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', name: 'raw_message' }),
    __metadata("design:type", String)
], RawEventEntity.prototype, "rawMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', name: 'event_timestamp' }),
    __metadata("design:type", Date)
], RawEventEntity.prototype, "eventTimestamp", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamptz', name: 'received_at' }),
    __metadata("design:type", Date)
], RawEventEntity.prototype, "receivedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamptz', name: 'created_at' }),
    __metadata("design:type", Date)
], RawEventEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', name: 'device_id' }),
    __metadata("design:type", String)
], RawEventEntity.prototype, "deviceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', name: 'processing_status', default: 'pending' }),
    __metadata("design:type", String)
], RawEventEntity.prototype, "processingStatus", void 0);
exports.RawEventEntity = RawEventEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'raw_events' }),
    (0, typeorm_1.Index)('idx_raw_events_created_at', ['createdAt']),
    (0, typeorm_1.Index)('idx_raw_events_processing_status', ['processingStatus']),
    (0, typeorm_1.Index)('idx_raw_events_device_id', ['deviceId'])
], RawEventEntity);
//# sourceMappingURL=raw-event.entity.js.map