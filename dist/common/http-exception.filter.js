"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalHttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let GlobalHttpExceptionFilter = class GlobalHttpExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest();
        const response = ctx.getResponse();
        const requestId = request.requestId ?? 'unknown';
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let code = 'INTERNAL_ERROR';
        let message = 'Internal server failure';
        if (exception instanceof common_1.BadRequestException) {
            status = common_1.HttpStatus.BAD_REQUEST;
            code = 'INVALID_PAYLOAD';
            const payload = exception.getResponse();
            if (Array.isArray(payload?.message)) {
                message = payload.message.join(', ');
            }
            else if (typeof payload?.message === 'string') {
                message = payload.message;
            }
            else {
                message = 'Invalid payload';
            }
        }
        else if (exception instanceof common_1.UnauthorizedException) {
            status = common_1.HttpStatus.UNAUTHORIZED;
            code = 'UNAUTHORIZED';
            message = 'Unauthorized';
        }
        else if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const payload = exception.getResponse();
            if (status === common_1.HttpStatus.TOO_MANY_REQUESTS) {
                code = 'RATE_LIMITED';
                message = 'Rate limited';
            }
            else if (status === common_1.HttpStatus.INTERNAL_SERVER_ERROR) {
                code = 'INTERNAL_ERROR';
                message = 'Internal server failure';
            }
            else {
                if (Array.isArray(payload?.message)) {
                    message = payload.message.join(', ');
                }
                else if (typeof payload?.message === 'string') {
                    message = payload.message;
                }
            }
        }
        const body = {
            error: {
                code,
                message,
                request_id: requestId,
            },
        };
        response.status(status).json(body);
    }
};
exports.GlobalHttpExceptionFilter = GlobalHttpExceptionFilter;
exports.GlobalHttpExceptionFilter = GlobalHttpExceptionFilter = __decorate([
    (0, common_1.Catch)()
], GlobalHttpExceptionFilter);
//# sourceMappingURL=http-exception.filter.js.map