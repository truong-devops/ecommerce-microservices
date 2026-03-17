import { randomUUID } from 'crypto';
import { NextFunction, Response } from 'express';
import { RequestWithContext } from '../types/request-context.type';

export function RequestIdMiddleware(req: RequestWithContext, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id') ?? randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
