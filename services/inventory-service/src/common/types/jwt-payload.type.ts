import { Role } from '../constants/role.enum';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  sessionId?: string;
  jti?: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}
