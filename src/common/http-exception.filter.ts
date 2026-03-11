import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";

type ErrorBody = {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
};

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const response = ctx.getResponse<Response>();

    const requestId = request.requestId ?? "unknown";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "Internal server failure";

    if (exception instanceof BadRequestException) {
      status = HttpStatus.BAD_REQUEST;
      code = "INVALID_PAYLOAD";
      const payload = exception.getResponse() as {
        message?: string | string[];
      };
      if (Array.isArray(payload?.message)) {
        message = payload.message.join(", ");
      } else if (typeof payload?.message === "string") {
        message = payload.message;
      } else {
        message = "Invalid payload";
      }
    } else if (exception instanceof UnauthorizedException) {
      status = HttpStatus.UNAUTHORIZED;
      code = "UNAUTHORIZED";
      message = "Unauthorized";
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse() as {
        message?: string | string[];
      };
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        code = "RATE_LIMITED";
        message = "Rate limited";
      } else if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        code = "INTERNAL_ERROR";
        message = "Internal server failure";
      } else {
        if (Array.isArray(payload?.message)) {
          message = payload.message.join(", ");
        } else if (typeof payload?.message === "string") {
          message = payload.message;
        }
      }
    }

    const body: ErrorBody = {
      error: {
        code,
        message,
        request_id: requestId,
      },
    };

    response.status(status).json(body);
  }
}
