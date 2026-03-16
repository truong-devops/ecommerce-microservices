import { Request } from 'express';

export interface RequestContextRequest extends Request {
  requestId?: string;
}
