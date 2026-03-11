import { NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { RequestWithContext } from './types';
export declare class RequestIdMiddleware implements NestMiddleware {
    use(req: RequestWithContext, res: Response, next: NextFunction): void;
}
