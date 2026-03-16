import { Role } from '../constants/role.enum';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  sessionId: string;
  jti: string;
  tokenVersion: number;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  jti: string;
  tokenVersion: number;
}
