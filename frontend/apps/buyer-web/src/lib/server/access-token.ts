export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
}

export function readBearerToken(value: string | null): string {
  if (!value) {
    return '';
  }

  const [type, token] = value.split(' ');
  if (!type || !token || type.toLowerCase() !== 'bearer') {
    return '';
  }

  return token;
}

export function decodeAccessToken(accessToken: string): AccessTokenClaims | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = base64UrlDecode(parts[1]);
    const parsed = JSON.parse(payload) as Partial<AccessTokenClaims>;

    if (!parsed.sub || !parsed.email || !parsed.role) {
      return null;
    }

    return {
      sub: parsed.sub,
      email: parsed.email,
      role: parsed.role
    };
  } catch {
    return null;
  }
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}
