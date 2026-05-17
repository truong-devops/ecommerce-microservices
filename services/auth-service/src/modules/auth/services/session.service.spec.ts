import { SessionService } from './session.service';

describe('SessionService', () => {
  it('revokes all active sessions and caches revoked session ids', async () => {
    const sessionRepository = {
      findActiveByUserId: jest.fn().mockResolvedValue([{ id: 'session-1' }, { id: 'session-2' }]),
      revokeAllByUserId: jest.fn().mockResolvedValue(undefined)
    };
    const refreshTokenRepository = {
      revokeAllByUserId: jest.fn().mockResolvedValue(undefined)
    };
    const redisService = {
      setWithTtl: jest.fn().mockResolvedValue(undefined)
    };

    const service = new SessionService(sessionRepository as never, refreshTokenRepository as never, redisService as never);

    await service.revokeAllSessions('user-1', 'replaced_by_new_login');

    expect(sessionRepository.findActiveByUserId).toHaveBeenCalledWith('user-1');
    expect(sessionRepository.revokeAllByUserId).toHaveBeenCalledWith('user-1', 'replaced_by_new_login');
    expect(refreshTokenRepository.revokeAllByUserId).toHaveBeenCalledWith('user-1');
    expect(redisService.setWithTtl).toHaveBeenCalledWith('revoked:session:session-1', '1', 60 * 60 * 24 * 30);
    expect(redisService.setWithTtl).toHaveBeenCalledWith('revoked:session:session-2', '1', 60 * 60 * 24 * 30);
  });
});
