export interface AuthUserRegisteredEvent {
  userId: string;
  email: string;
  role: string;
}

export interface AuthEmailVerificationRequestedEvent {
  userId: string;
  email: string;
  token: string;
}

export interface AuthPasswordResetRequestedEvent {
  userId: string;
  email: string;
  token: string;
}

export interface AuthRefreshReuseDetectedEvent {
  userId: string;
  sessionId: string;
  requestId: string;
}
