import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { GovernancePolicyEntity } from '../entities/governance-policy.entity';
import { UserEntity } from '../entities/user.entity';
import { GovernanceService } from './governance.service';

describe('GovernanceService', () => {
  const superAdmin: AuthenticatedUserContext = {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.com',
    role: Role.SUPER_ADMIN,
    sessionId: 'session-1',
    jti: 'jti-1',
    tokenVersion: 0
  };

  function setup() {
    const policies = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
      count: jest.fn(),
      findAndCount: jest.fn()
    };
    const actionLogs = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'log-1', ...value })),
      count: jest.fn(),
      findAndCount: jest.fn()
    };
    const systemLogs = { count: jest.fn(), findAndCount: jest.fn() };
    const users = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
      count: jest.fn(),
      findAndCount: jest.fn()
    };
    const service = new GovernanceService(policies as never, actionLogs as never, systemLogs as never, users as never);
    return { service, policies, actionLogs, users };
  }

  it('increments policy version only when content changes', async () => {
    const { service, policies, actionLogs } = setup();
    const policy = Object.assign(new GovernancePolicyEntity(), {
      id: 'policy-1',
      code: 'PRODUCT-001',
      title: 'Old title',
      description: 'Description',
      scope: 'PRODUCT',
      status: 'PUBLISHED',
      version: 2,
      content: 'Original policy content',
      effectiveAt: null,
      createdBy: superAdmin.userId,
      updatedBy: superAdmin.userId
    });
    policies.findOne.mockResolvedValue(policy);

    const updated = await service.updatePolicy(superAdmin, policy.id, {
      title: 'New title',
      content: 'Updated policy content'
    });

    expect(updated.version).toBe(3);
    expect(updated.updatedBy).toBe(superAdmin.userId);
    expect(actionLogs.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'POLICY_UPDATED' }));
  });

  it('prevents an administrator from changing their own access', async () => {
    const { service, users } = setup();
    users.findOne.mockResolvedValue(
      Object.assign(new UserEntity(), { id: superAdmin.userId, email: superAdmin.email, role: Role.SUPER_ADMIN, isActive: true })
    );

    await expect(service.updateTeamMember(superAdmin, superAdmin.userId, { isActive: false })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents a regular admin from granting the admin role', async () => {
    const { service, users } = setup();
    const actor = { ...superAdmin, userId: '22222222-2222-4222-8222-222222222222', role: Role.ADMIN };
    users.findOne.mockResolvedValue(
      Object.assign(new UserEntity(), {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'moderator@example.com',
        role: Role.MODERATOR,
        isActive: true
      })
    );

    await expect(service.updateTeamMember(actor, '33333333-3333-4333-8333-333333333333', { role: Role.ADMIN })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('prevents a regular admin from disabling another administrator', async () => {
    const { service, users } = setup();
    const actor = { ...superAdmin, userId: '22222222-2222-4222-8222-222222222222', role: Role.ADMIN };
    users.findOne.mockResolvedValue(
      Object.assign(new UserEntity(), {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'peer-admin@example.com',
        role: Role.ADMIN,
        isActive: true
      })
    );

    await expect(service.updateTeamMember(actor, '33333333-3333-4333-8333-333333333333', { isActive: false })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});
