import { Request } from 'express';
import { Role } from '../constants/role.enum';

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  role: Role;
  jti?: string;
  sessionId?: string;
  tokenVersion?: number;
}

export interface RequestWithContext extends Request {
  requestId: string;
  user?: AuthenticatedUserContext;
}
