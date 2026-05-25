import type { AuthSession, RotatedAuthTokens } from '@frontend/buyer-contracts';

export function serializeSession(session: AuthSession): string {
  return JSON.stringify(session);
}

export function parseSession(raw: string | null): AuthSession | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.sessionId !== 'string' ||
      !parsed.user ||
      typeof parsed.user.id !== 'string' ||
      typeof parsed.user.email !== 'string'
    ) {
      return null;
    }
    return parsed as AuthSession;
  } catch {
    return null;
  }
}

export function mergeRotatedTokens(session: AuthSession, tokens: RotatedAuthTokens): AuthSession {
  return { ...tokens, user: session.user };
}
