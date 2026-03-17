import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn()
  } as unknown as Reflector;

  const guard = new JwtAuthGuard(reflector);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws unauthorized when user is missing', () => {
    expect(() => guard.handleRequest(null, undefined as never)).toThrow(UnauthorizedException);
  });

  it('returns user when authenticated', () => {
    const user = { userId: '11111111-1111-4111-8111-111111111111' };
    expect(guard.handleRequest(null, user)).toEqual(user);
  });
});
