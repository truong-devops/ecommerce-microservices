import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('throws unauthorized when user is missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false)
    } as unknown as Reflector;

    const guard = new JwtAuthGuard(reflector);

    expect(() => guard.handleRequest(undefined, undefined)).toThrow(UnauthorizedException);
  });
});
