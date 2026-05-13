import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const currentUser: AuthenticatedUserContext = {
    userId: 'user-1',
    email: 'user@example.com',
    role: Role.CUSTOMER,
    sessionId: 'session-1',
    jti: 'jti-1',
    tokenVersion: 1
  };

  it('delegates getMe to authService', async () => {
    const authService = {
      getMe: jest.fn().mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          role: Role.CUSTOMER,
          isEmailVerified: true,
          mfaEnabled: false
        }
      })
    };

    const controller = new AuthController(authService as never);
    const result = await controller.getMe(currentUser);

    expect(authService.getMe).toHaveBeenCalledWith(currentUser);
    expect(result).toEqual({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: Role.CUSTOMER,
        isEmailVerified: true,
        mfaEnabled: false
      }
    });
  });
});

