import { Request } from 'express';
export type RequestWithContext = Request & {
    requestId?: string;
    authToken?: string;
};
