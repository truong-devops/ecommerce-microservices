export type RegisterRole = 'CUSTOMER' | 'SELLER';

export interface RegisterRequest {
  email: string;
  password: string;
  role: RegisterRole;
}

export interface RegisterResponse {
  userId: string;
  email: string;
  role: RegisterRole;
  emailVerificationRequired: boolean;
  verifyToken?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface LoginUser {
  id: string;
  email: string;
  role: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  sessionId: string;
  user: LoginUser;
}
