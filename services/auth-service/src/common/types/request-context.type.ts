import { Request } from 'express';

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  jti: string;
  tokenVersion: number;
}

export interface RequestWithContext extends Request {
  requestId: string;
  user?: AuthenticatedUserContext;
}
